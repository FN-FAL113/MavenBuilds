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

const xml2js_parse_string = util.promisify(xml2js.parseString)
const child_process = util.promisify(child_proc.exec)

require('dotenv').config()

const repoResources = async () => getRepoResource()

/**
 * 
 * @returns {JSONObject} json file contents parsed as json object
 */
function getRepoResource(){
    return new Promise(async (resolve, reject) =>{
        try {
            const data = await readFile('./resources/repos.json', 'utf8')
           
            resolve(JSON.parse(data))
        } catch (error) {
            console.error(`\nGet repos.json error encountered: (debug locally)`)

            reject()
        }
    })
}
/**
 * @description Clones remote repository based from repos.json data
 * 
 * After cloning set the final jar output file name through #setPomFinalName
 * 
 * Deletion of local repositories is executed before cloning
 * @param {JSONObject} repos the parsed json content from "./resources/repos.json"
 * @returns {Promise} a resolved or rejected promise
 */
async function cloneRepo(repos){
    return new Promise(async (resolve, reject) =>{    
        for(const repo of repos) { 
            await delDirectoryIfExist(`./repos/${repo.github_username}/${repo.repository}`)  
        } 

        for(const repo of repos) {
            // we loop through repos.json and check if any are stored locally 
            // if it exist then it gets deleted and a new clone gets initiated
            const repository = repo.repository
            const repoOwner = repo.github_username
            const branch = repo.branch

            console.log(`\n${new Date(Date.now())}: Cloning ${repository}!`);

            await child_process(`git clone -b ${branch} https://${repos[0].github_username}:${process.env.API_KEY}@github.com/${repoOwner}/${repository}.git repos/${repoOwner}/${repository}`)
              
            
            // skip builds repo
            if(repository !== repos[0].repository){
                await setPomFinalName(repoOwner, repository)       
            } 
        }

        resolve()
    }).catch(() => console.error('Clone repo or delete directory error encountered: (debug locally)'))
}

/**
 * @description Delete existing files and directories with given path
 * 
 * @param {String} path cloned repository path location
 * @returns {Promise} a resolved or rejected promise
 */
function delDirectoryIfExist(path){
    return new Promise(async (resolve, reject) => {
        try {
            await access(path)
            
            console.log(`\n${new Date(Date.now())}: Deleting local repo: ${path}`)
            await rm(path, { maxRetries: 5, retryDelay: 2000, recursive: true, force: true })

            resolve()
        } catch (error) {
            console.log(`\n${new Date(Date.now())}: Skipping deletion for "${path}" due to empty directory`)

            resolve()
        }  
    })      
}

/**
 * @description Set or add a final name in the pom.xml file
 * by parsing first the xml file content to a json object 
 * then do object mutation by referencing pom.xml defined property
 * then parse the object back to XML format and finally write to pom.xml file 
 * 
 * @param {String} repoOwner the remote repo owner username
 * @param {String} repo the name of the remote repo
 * @returns {Promise} a resolved or rejected promise
 */
function setPomFinalName(repoOwner, repo){
    return new Promise(async (resolve, reject) => {
        try {
            // read XML file
            const xmlData = await readFile(`./repos/${repoOwner}/${repo}/pom.xml`, 'utf8')
    
             // convert XML data to JSON object
            const parsedXml = await xml2js_parse_string(xmlData)

            // property value is assigned through an array            
            parsedXml.project.build[0].finalName = ['${project.name} v${project.version}']

            // convert JSON object to XML
            const builder = new xml2js.Builder();
            const xml = builder.buildObject(parsedXml);

            // write updated XML string to a file
            // overrites the pom file, we don't want to append it
            await writeFile(`./repos/${repoOwner}/${repo}/pom.xml`, xml)

            console.log(`\n${new Date(Date.now())}: Successfully updated ${repo} pom.xml`);

            resolve()
        } catch (error) {
            console.error(`\n${new Date(Date.now())}: Set ${repo} pom.xml error: ` + error)

            reject()
        }

    }).catch(() => console.error('Set pom final name error encountered: (debug locally)' /* + error */))
}

/**
 * @description loop through repos and iniatate maven build for each
 * repo using defined repo properties as data
 * 
 * Skip build for any existing repo commit hash named folder or if commit message include "ci skip"
 * 
 * @param {JSONObject} repos the parsed json content from "./resources/repos.json"
 * @returns {Promise} a resolved or rejected promise
 */
async function buildAndTransferFiles(repos){
    return new Promise(async (resolve, reject) =>{
        try{
            for(const repo of repos) {
                // skip builds repo
                if(repo.repository === repos[0].repository){
                    continue
                }

                const repository = repo.repository
                const repoOwner = repo.github_username
                const branch = repo.branch
                const buildsRepo = repos[0].repository

                console.log(`\n${new Date(Date.now())}: Compiling ${repository}`)
                
                // if ci skip is used
                if(await checkCommitMessage(repoOwner, repository)){
                    continue
                }
              
                // if existing named commit directory exist
                if(await checkCommitDir(repoOwner, repository, branch, buildsRepo)){  
                    console.log(`\n${new Date(Date.now())}: Skipped compiling ${repository} due to no new commits`)

                    continue
                }
                
                await mavenBuild(repoOwner, repository, branch, buildsRepo)
            }

            resolve()
        } catch(error){
            reject()
        }
    }).catch(() => console.error('Build and transfer files error encountered: (debug locally)' /* + error */))
}

/**
 * @description Build the cloned repository at the same time
 * move the output jar and log file if build is successful
 * else only log file will be moved 
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the remote repo
 * @param {String} branch repo branch 
 * @param {String} buildsRepo the remote builds repo
 * @returns {Promise} a resolved or rejected promise
 */
function mavenBuild(repoOwner, repo, branch, buildsRepo){
    return new Promise(async (resolve, reject) =>{
        mvn.create({
            // the working directory that maven will build upon
            cwd: `./repos/${repoOwner}/${repo}`,
        }).execute(['clean', 'package' ,`-lbuild.txt`], { 'skipTests': true }).then(async () => {
            console.log(`\n${new Date(Date.now())}: Successfully compiled ${repo}!`)

            await moveJarFile(repoOwner, repo, branch, buildsRepo)
            await moveLogFile(repoOwner, repo, branch, buildsRepo)

            resolve()
        }).catch(async () => {
            console.log(`\n${new Date(Date.now())}: Failed to compile ${repo}!`)
            
            await moveLogFile(repoOwner, repo, branch, buildsRepo)

            reject()
        })
    }).catch(() => console.error('Maven build error encountered'))
}

/**
 * @description check the latest commit message of the
 * cloned repo if it includes "ci skip"
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned remote repo
 * @returns {Promise} a resolved or rejected promise with a boolean value
 */
function checkCommitMessage(repoOwner, repo){
    return new Promise(async (resolve, reject) => {
        const { err, stdout, stderr } = await child_process(`cd ./repos/${repoOwner}/${repo} && git log --format=%B -n 1`)
        const commitMessage = stdout.toString().trim()

        if(commitMessage.includes('[ci skip]') || commitMessage.includes('[CI SKIP]')){
            console.log(`\n${new Date(Date.now())}: Skipping ${repo} build because of commit message`)

            resolve(true)
        } else {
            resolve(false)
        }
    })
}

/**
 * @description check if existing a commit named folder exist in the
 * buildsRepo by using the latest commit hash of the cloned repo
 * 
 * A new commit named folder directory is created if one doesn't exist
 * this folder are where the output jar and log file will be transferred
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned remote repo
 * @param {String} branch repo branch 
 * @param {String} buildsRepo the remote builds repo
 * @returns {Promise} a resolved or rejected promise with a boolean value
 */
function checkCommitDir(repoOwner, repo, branch, buildsRepo){
    return new Promise(async (resolve, reject) => {
        const currentCommit = await getCurrentCommitHash(repoOwner, repo)
        
        try {
            await access(`./repos/${repoOwner}/${buildsRepo}/repos/${repoOwner}/${repo}/${branch}/${currentCommit}`)

            resolve(true)
        } catch (error) {
            await createCommitDir(repoOwner, repo, branch, buildsRepo, currentCommit)
    
            resolve(false)
        }
    }).catch(() => console.error('Check commit directory error encountered: (debug locally)'))
}

/**
 * @description creates a commit named folder in the builds repo
 * using repo defined properties as the folder path names
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned remote repo
 * @param {String} branch repo branch 
 * @param {String} buildsRepo the remote builds repo
 * @param {String} currentCommit latest cloned repo commit hash
 * @returns {Promise} a resolved or rejected promise
 */
function createCommitDir(repoOwner, repo, branch, buildsRepo, currentCommit){
    const mkdirArgs = `mkdir "./repos" "./repos/${repoOwner}" "./repos/${repoOwner}/${repo}" "./repos/${repoOwner}/${repo}/${branch}" "./repos/${repoOwner}/${repo}/${branch}/${currentCommit}"`

    return new Promise(async (resolve, reject) => {
        await child_process(`cd ./repos/${repoOwner}/${buildsRepo} && ${mkdirArgs}`)

        console.log(`\n${new Date(Date.now())}: ${repo} build output directory created`)

        resolve()
    }).catch(() => console.error('Create commit directory error encountered: (debug locally)'))
}

/**
 * @description moves the output jar file out of the cloned
 * repo target folder into the cloned builds repo directory
 * with the repo defined properties as the folder path names
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned remote repo
 * @param {String} branch repo branch 
 * @param {String} buildsRepo the remote builds repo
 * @returns {Promise} a resolved or rejected promise
 */
function moveJarFile(repoOwner, repo, branch, buildsRepo){
    return new Promise(async (resolve, reject) => {
        try {
            // read XML file
            const xmlData = await readFile(`./repos/${repoOwner}/${repo}/pom.xml`, 'utf8')
    
             // convert XML data to JSON object
            const parsedXml = await xml2js_parse_string(xmlData)

            const jarName = `"` + parsedXml.project.name[0] + " v" + parsedXml.project.version[0] + ".jar" + `"`

            const commitHash = await getCurrentCommitHash(repoOwner, repo)
    
            const moveJarFileArgs = `cd ./repos/${repoOwner}/${repo}/target && mv ${jarName} ../../${buildsRepo}/repos/${repoOwner}/${repo}/${branch}/${commitHash}` 

            await child_process(moveJarFileArgs)

            console.log(`\n${new Date(Date.now())}: Successfully transferred ${repo} jar file`)

            resolve()
        } catch (error) {
            console.log(`\n${new Date(Date.now())}: Error moving ${repo} jar file: ` + error)   

            reject()
        }
    }).catch(() => console.error('Move jar file error encountered: (debug locally)' /*+ error */))
}


/**
 * @description moves the output build log file out of the cloned
 * repo target folder into the cloned builds repo directory
 * with the repo defined properties as the folder path names
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned remote repo
 * @param {String} branch repo branch 
 * @param {String} buildsRepo the remote builds repo
 * @returns {Promise} a resolved or rejected promise
 */
function moveLogFile(repoOwner, repo, branch, buildsRepo){
    return new Promise(async (resolve, reject) => {
        const commitHash = await getCurrentCommitHash(repoOwner, repo)
        const moveBuildLogArgs = `cd ./repos/${repoOwner}/${repo} && mv "build.txt" ../${buildsRepo}/repos/${repoOwner}/${repo}/${branch}/${commitHash}`

        try {
            await child_process(moveBuildLogArgs)

            console.log(`\n${new Date(Date.now())}: Successfully transferred ${repo} build logs`)
    
            resolve()
        } catch (error) {
            console.error(`\n${new Date(Date.now())}: Error encountered while transferring ${repo} build logs!`)
    
            reject()   
        }
    }).catch(() => console.error('Move log file error encountered: (debug locally)' /* + error */ ))
}


/**
 * @description get the latest commit hash from a 
 * given repo defined property
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned remote repo 
 * @returns {Promise} a resolve primise with a 7 characters commit hash value
 */
function getCurrentCommitHash(repoOwner, repo){
    return new Promise(async (resolve, reject) => {
        // we use #trim to remove white spaces at the end of the current commit hash being ommitted by converting a cmd command response to string
        const {err, stdout, stderr} = await child_process(`cd ./repos/${repoOwner}/${repo} && git rev-parse --short=7 HEAD`)

        resolve(stdout.toString().trim())
    })
}

/**
 * @description commit local changes in the cloned 
 * build repository and finally push to remote repo
 * 
 * @param {JSONObject} repos json file contents parsed as json object
 * @returns {Promise} a resolved or rejected promise
 */
async function commitPushToBuilds(repos){
    return new Promise(async (resolve, reject) => {
        const setConfUser = `git config user.name FN-FAL113 && git config user.email ${process.env.EMAIL}`
        const gitCommit = `git commit -m "${process.env.ACTION_NAME} #${process.env.RUN_ID}"`
        
        try{
            await child_process(`cd ./repos/${repos[0].github_username}/${repos[0].repository}/ && ${setConfUser} && git add . && ${gitCommit} && git push origin`)
          
            console.log(`\n${new Date(Date.now())}: Successfully committed changes ${repos[0].repository} remote repository!`)

            resolve()
        } catch (error) {
            reject(`\n${new Date(Date.now())}: Nothing to commit on ${repos[0].repository} remote repository`)
        }
        
    }).catch((error) => console.error(error))
}

module.exports = { repoResources, cloneRepo, buildAndTransferFiles, commitPushToBuilds, delDirectoryIfExist }