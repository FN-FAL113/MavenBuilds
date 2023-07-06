// The needed environment variables must be supplied through .env file or github repo secrets
// Error messages are commented out for security reasons, it must be debugged
// locally and reject() promises must be supplied with the referenced error e.g reject(error) 
// Author: FN_FAL113 (https://github.com/FN-FAL113/)
// License: GNU General Public License v3.0

const child_proc = require('child_process')
const mvn = require('maven')
const xml2js = require('xml2js')
const {access, rm, readFile, writeFile} = require('fs').promises
const util = require('util')
const fetch = require("node-fetch")

// promisify error-first-callback async methods
const xml2js_parse_string = util.promisify(xml2js.parseString)
const child_process = util.promisify(child_proc.exec)

// platform dependent move file command
const moveCmd = process.platform === "win32" ? "move" : "mv"

require('dotenv').config()

/**
 * 
 * @returns {JSONObject} json file contents parsed as json object
 */
async function getRepoResource(){
    try {
        return JSON.parse(await readFile('./resources/repos.json', 'utf8'))
    } catch (error) {
        console.error(`\nGet repos.json error encountered: (debug locally)`)
    }
}

/**
 * @description The starting point of the app,
 * does the necessary task from cloning, building, etc.
 * 
 * @param {JSONObject} repos the parsed json content from "./resources/repos.json"
 */
async function start(repos){
    // delete locally cloned repositories
    for(const repo of repos) {   
        await delDirectoryIfExist(`./cloned_repos/${repo.github_username}/${repo.repository}`)
            .catch((err) => console.log(`\n${new Date(Date.now())}: "${`./cloned_repos/${repo.github_username}/${repo.repository}`}" does not exist, skipping directory deletion.`))
    }

    const promises = []

    for(const repo of repos) {
        const repository = repo.repository
        const repoOwner = repo.github_username
        const branch = repo.branch
        const buildsRepo = repos[0].repository

        if(repository === repos[0].repository){
            await child_process(`git clone -b ${branch} https://${repos[0].github_username}:${process.env.API_KEY}@github.com/${repoOwner}/${repository}.git cloned_repos/${repoOwner}/${repository}`)
                .catch((err) => console.error(`\n${new Date(Date.now())}: Failed to clone "${repository}", please debug locally.`))
            
            continue
        } 

        // retrieve commit hash and message for this repo
        const [latestCommitHash, commitMessage] = await getLatestCommitHashAndMessage(repoOwner, repository)

        // if commit message contains "[ci skip]"
        if(await checkCommitMessage(repository, commitMessage)){
            continue
        }
        
        // if existing named commit directory exist in the maven builds repo
        if(await checkCommitDir(repoOwner, repository, branch, buildsRepo, latestCommitHash)){  
            continue 
        }

        console.log(`\n${new Date(Date.now())}: Cloning "${repository}".`);

        promises.push(
            child_process(`git clone -b ${branch} https://${repos[0].github_username}:${process.env.API_KEY}@github.com/${repoOwner}/${repository}.git repos/${repoOwner}/${repository}`)
            .then(
                () => setPomFinalJarName(repoOwner, repository), 
                (err) => console.error(`\n${new Date(Date.now())}: Failed to clone "${repository}", please debug locally.`)
            )
            .then(
                () => buildAndTransferFiles(repoOwner, repository, branch, buildsRepo, latestCommitHash), 
                (err) => console.error(`\n${new Date(Date.now())}: Set pom final jar name for "${repository}" error encountered: ` + err)
            )
            .then(
                () => console.log(`\n${new Date(Date.now())}: Task for "${repository}" finished successfully.`), 
                (err) => console.error(`\n${new Date(Date.now())}: Build and transfer output files for "${repository}" error encountered, please debug locally.`)
            )
        )
    }

    // push changes to remote builds repo
    Promise.all(promises).then(() => commitPushToBuildsRepo(repos))
}

/**
 * 
 * @param {String} repoOwner the remote repo owner username
 * @param {String} repository the name of the remote repo
 * @returns {Array} an array that contains latest commit hash and message
 */
async function getLatestCommitHashAndMessage(repoOwner, repository){
    try {
        // fetch latest commit hash and commit message
        const res = await fetch(`https://api.github.com/repos/${repoOwner}/${repository}/commits`)
        const json = await res.json()

        const latestCommitHash = json[0]?.sha ? json[0].sha.substring(0, 7) : null
        const commitMessage = json[0]?.commit?.message ? json[0].commit.message : null
    
        return [latestCommitHash, commitMessage]
    } catch (error) {
        throw new Error(`\n${new Date(Date.now())}: retrieving "${repository}" latest commit hash error encountered, please debug locally.`)
    }
}

/**
 * @description Delete existing files and directories with given path
 * 
 * @param {String} path cloned repository path location
 * @returns {Promise} a promise object
 */
async function delDirectoryIfExist(path){
    return new Promise(async (resolve, reject) => {
        try {
            // throws an error if path does not exist
            await access(path) 
            
            console.log(`\n${new Date(Date.now())}: "${path}" directory is being deleted`)
            
            // recursively delete files from the given path
            await rm(path, { maxRetries: 5, retryDelay: 2000, recursive: true, force: true })

            resolve()
        } catch (error) {
            reject(error)
        }  
    })      
}

/**
 * @description Set or add a final name element in the pom.xml file
 * by parsing the xml to a json object which will be mutated and 
 * parsed back to XML for serialization.
 * 
 * @param {String} repoOwner the remote repo owner username
 * @param {String} repo the name of the remote repo
 * @returns {Promise} a promise object
 */
async function setPomFinalJarName(repoOwner, repo){
    return new Promise(async (resolve, reject) => {
        try {
            // read XML file
            const xmlData = await readFile(`./cloned_repos/${repoOwner}/${repo}/pom.xml`, 'utf8')
    
             // convert XML data to JSON object
            const parsedXml = await xml2js_parse_string(xmlData)

            // property value is assigned through an array            
            parsedXml.project.build[0].finalName = ['${project.name} v${project.version}']

            // convert JSON object to XML
            const builder = new xml2js.Builder();
            const xml = builder.buildObject(parsedXml);

            // overwrite the pom file, we don't wanna append it
            await writeFile(`./cloned_repos/${repoOwner}/${repo}/pom.xml`, xml)

            console.log(`\n${new Date(Date.now())}: Successfully updated "${repo}" pom.xml.`);

            resolve()
        } catch (error) {
            reject(error)
        }
    })
}

/**
 * @description create builds repo commit directory 
 * then build and transfer compiled output files.
 * 
 * @param {JSONObject} repos the parsed json content from "./resources/repos.json"
 * @returns {Promise} a resolved or rejected promise
 */
async function buildAndTransferFiles(repoOwner, repo, branch, buildsRepo, latestCommitHash){
    return new Promise(async (resolve, reject) =>{
        try{
            console.log(`\n${new Date(Date.now())}: Compiling ${repo}`)
            
            await createCommitDir(repoOwner, repo, branch, buildsRepo, latestCommitHash)
            
            await mavenBuild(repoOwner, repo, branch, buildsRepo, latestCommitHash)

            resolve()
        } catch(error) {
            reject(error)
        }
    })
}

/**
 * @description Build the cloned repository if successful
 * move the output jar and log file else only log file will be moved.
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the remote repo
 * @param {String} branch repo branch 
 * @param {String} buildsRepo the remote builds repo
 * @returns {Promise} a promise object
 */
async function mavenBuild(repoOwner, repo, branch, buildsRepo, latestCommitHash){
    return mvn.create({
        // the working directory that maven will build upon
        cwd: `./cloned_repos/${repoOwner}/${repo}`,
    }).execute(['clean', 'package' ,`-lbuild.txt`], { 'skipTests': true }).then(async () => {
        console.log(`\n${new Date(Date.now())}: Successfully compiled "${repo}".`)

        await moveJarFile(repoOwner, repo, branch, buildsRepo, latestCommitHash)
        await moveLogFile(repoOwner, repo, branch, buildsRepo, latestCommitHash)
    }).catch(async () => {
        await moveLogFile(repoOwner, repo, branch, buildsRepo, latestCommitHash)

        throw new Error(`\n${new Date(Date.now())}: Failed to maven compile package for "${repo}". please check build log file.`)
    })
}

/**
 * @description check the latest commit message of the
 * cloned repo if it includes "ci skip"
 * 
 * @param {String} repo the name of the cloned remote repo
 * @param {String} message the commit message
 * @returns {Promise} a resolved or rejected promise with a boolean value
 */
async function checkCommitMessage(repo, commitMessage){
    try {
        if(commitMessage.includes('[ci skip]') || commitMessage.includes('[CI SKIP]')){
            console.log(`\n${new Date(Date.now())}: "ci skip" detected in commit message, skipping "${repo}" clone and build.`)

            return true
        } 
        
        return false
    } catch (error) {
        throw new Error(`\n${new Date(Date.now())}: Check "${repo}" commit message error encountered, please debug locally.: ` + error)
    }
}

/**
 * @description check if a commit folder exist in the cloned builds
 * repo where the output jar and log file will be transferred
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned remote repo
 * @param {String} branch repo branch 
 * @param {String} buildsRepo the remote builds repo
 * @param {String} latestCommitHash the latest commit hash for the cloned repo
 */
async function checkCommitDir(repoOwner, repo, branch, buildsRepo, latestCommitHash){
    try {
        // an commit named folder exist, 
        if(!latestCommitHash) {
            console.log(`\n${new Date(Date.now())}: Skipped clone and compile "${repo}" due to no new remote commits.`)

            return true
        }
 
        // throws an error if path does not exist
        await access(`./cloned_repos/${repoOwner}/${buildsRepo}/repos/${repoOwner}/${repo}/${branch}/${latestCommitHash}`) 

        console.log(`\n${new Date(Date.now())}: Skipped clone and compile "${repo}" due to no new remote commits.`)
        
        return true
    } catch (error) {
        return false
    }
}

/**
 * @description creates a commit named folder in the builds repo
 * using repo defined properties as the folder path names
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned remote repo
 * @param {String} branch repo branch 
 * @param {String} buildsRepo the remote builds repo
 * @param {String} latestCommitHash the latest commit hash for the cloned repo
 */
async function createCommitDir(repoOwner, repo, branch, buildsRepo, latestCommitHash){
    try {
        await child_process(`cd ./cloned_repos/${repoOwner}/${buildsRepo} && mkdir "./cloned_repos/${repoOwner}/${repo}/${branch}/${latestCommitHash}"`)

        console.log(`\n${new Date(Date.now())}: Created "${`./cloned_repos/${repoOwner}/${repo}/${branch}/${latestCommitHash}`}" builds commit directory.`)
    } catch (error) {
        console.error(`Create "${repo}" builds commit directory error encountered: (debug locally for security)` + "" /** error **/)
    }
}

/**
 * @description moves the output jar file out of the cloned
 * repo target folder into the cloned builds repo directory
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned remote repo
 * @param {String} branch repo branch 
 * @param {String} buildsRepo the remote builds repo
 * @param {String} latestCommitHash the latest commit hash for the cloned repo
 */
async function moveJarFile(repoOwner, repo, branch, buildsRepo, latestCommitHash){
    try {
        // read XML file
        const xmlData = await readFile(`./cloned_repos/${repoOwner}/${repo}/pom.xml`, 'utf8')

        // convert XML data to JSON object
        const parsedXml = await xml2js_parse_string(xmlData)

        const jarName = `"` + parsedXml.project.name[0] + " v" + parsedXml.project.version[0] + ".jar" + `"`

        await child_process(`cd ./cloned_repos/${repoOwner}/${repo}/target && ${moveCmd} ${jarName} ../../${buildsRepo}/repos/${repoOwner}/${repo}/${branch}/${latestCommitHash}` )

        console.log(`\n${new Date(Date.now())}: Successfully transferred jar file for "${repo}".`)
    } catch(error) {
        console.log(`\n${new Date(Date.now())}: Error moving jar file for "${repo}": ` + error)   
    }
}

/**
 * @description moves the output build log file out of the cloned
 * repo target folder into the cloned builds repo directory
 * with the repo defined properties as the folder path names.
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned repo
 * @param {String} branch repo branch 
 * @param {String} buildsRepo the remote builds repo
 * @param {String} latestCommitHash the latest commit hash for the cloned repo
 */
async function moveLogFile(repoOwner, repo, branch, buildsRepo, latestCommitHash){
    try {
        await child_process(`cd ./cloned_repos/${repoOwner}/${repo} && ${moveCmd} "build.txt" ../${buildsRepo}/repos/${repoOwner}/${repo}/${branch}/${latestCommitHash}`)

        console.log(`\n${new Date(Date.now())}: Successfully transferred build logs for "${repo}".`)
    } catch(error) {
        console.error(`\n${new Date(Date.now())}: Error encountered while transferring build logs for "${repo}". please debug locally.`)  
    }
}

/**
 * @description commit local changes from build
 * repository and push changes remotely.
 * 
 * @param {JSONObject} repos json file parsed as json object
 * @returns {Promise} a promise object
 */
async function commitPushToBuildsRepo(repos){
    return new Promise(async (resolve, reject) => {
        const setConfUser = `git config user.name FN-FAL113 && git config user.email ${process.env.EMAIL}`
        const gitCommit = `git commit -m "${process.env.ACTION_NAME} #${process.env.RUN_ID}"`
        
        try{
            await child_process(`cd ./cloned_repos/${repos[0].github_username}/${repos[0].repository}/ && ${setConfUser} && git add . && ${gitCommit} && git push origin`)
          
            console.log(`\n${new Date(Date.now())}: Successfully committed changes to remote builds repository (${repos[0].repository}).`)

            resolve()
        } catch (error) {
            reject(`\n${new Date(Date.now())}: Nothing to commit on remote builds repository (${repos[0].repository}).`) 
        }
    }).catch((error) => console.error(error))
}

module.exports = { start, getRepoResource }
