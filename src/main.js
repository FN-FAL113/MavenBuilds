// The needed environment variables must be supplied through .env file or github repo secrets
// some error messages are ommitted for security, it must be debugged locally
// Author: FN_FAL113 (https://github.com/FN-FAL113)
// License: GNU General Public License v3.0

const child_proc = require('child_process')
const util = require('util')
const { join } = require('path')
const { access, rm, readFile } = require('fs').promises
const fetch = require("node-fetch")
const mvn = require('maven')


// promisify error-first-callback async methods
const child_process = util.promisify(child_proc.exec)

// platform dependent move file command
const moveCmd = process.platform === "win32" ? "move" : "mv"

require('dotenv').config()

let repos = null

/**
 * 
 * @returns {JSONObject} json file contents parsed as json object
 */
async function getRepoResource(){
    try {
        repos = JSON.parse(await readFile('./resources/repos.json', 'utf8'))
    } catch (error) {
        throw new Error(`\nGet repos.json error encountered: (debug locally)`)
    }
}

/**
 * @description The starting point of the app,
 * does the necessary task from cloning, building, etc.
 * 
 */
async function start(){
    // delete locally cloned repositories
    for(const repo of repos) {   
        await delDirectoryIfExist(`./cloned_repos/${repo.github_username}/${repo.repository}`)
            .catch((err) => console.log(`\n${new Date(Date.now())}: "${`./cloned_repos/${repo.github_username}/${repo.repository}`}" doesn't exist, skipping directory deletion.`))
    }

    const promises = []

    for(const repo of repos) {
        const repository = repo.repository
        const repoOwner = repo.github_username
        const branch = repo.branch

        const clonedReposPath = join('cloned_repos', repoOwner, repository)

        if(repository === repos[0].repository){
            console.log(`\n${new Date(Date.now())}: Cloning "${repository}" (Builds Repo).`);

            await child_process(`git clone -b ${branch} https://${repos[0].github_username}:${process.env.API_KEY}@github.com/${repoOwner}/${repository}.git ${clonedReposPath}`)
                .catch((err) => console.error(`\n${new Date(Date.now())}: Failed to clone "${repository}", please debug locally.`))
            
            continue
        } 

        // retrieve commit hash and message for this repo
        const [latestCommitHash, commitMessage] = await getLatestCommitHashAndMessage(repoOwner, repository)

        // if commit message contains "[ci skip]"
        if(checkCommitMessage(repository, commitMessage)){
            continue
        }
        
        // if existing named commit directory exist inside cloned builds repo
        if(await checkBuildsRepoCommitDir(repoOwner, repository, branch, latestCommitHash)){  
            continue 
        }

        console.log(`\n${new Date(Date.now())}: Cloning "${repository}".`);

        promises.push(
            child_process(`git clone -b ${branch} https://${repos[0].github_username}:${process.env.API_KEY}@github.com/${repoOwner}/${repository}.git ${clonedReposPath}`)
                .then(() => createBuildsRepoCommitDir(repoOwner, repository, branch, latestCommitHash))
                .then(() => buildAndTransferFiles(repoOwner, repository, branch, latestCommitHash))
                .then(() => console.log(`\n${new Date(Date.now())}: Task for "${repository}" finished successfully.`))
                .catch((err) => console.error(`\n${new Date(Date.now())}: Task for "${repository}" failed with error: \n` + err))
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
        throw new Error(`\n${new Date(Date.now())}: fetch "${repository}" latest commit hash error encountered, please debug locally.`)
    }
}

/**
 * @description Delete existing directory and files recursively with given path parameter
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
 * @description build and transfer compiled output files.
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned remote repo
 * @param {String} branch repo branch 
 * @param {String} buildsRepo the remote builds repo
 * @param {String} latestCommitHash the latest commit hash for the cloned repo
 * @returns {Promise} a resolved or rejected promise
 */
async function buildAndTransferFiles(repoOwner, repo, branch, latestCommitHash){
    return new Promise(async (resolve, reject) => {
        console.log(`\n${new Date(Date.now())}: Compiling ${repo}`)

        // maven build
        mvn.create({
            // the working directory that maven will build upon
            cwd: join('cloned_repos', repoOwner, repo),
        })
        .execute(['clean', 'package' ,`-lbuild.txt`], { 'skipTests': true })
        .then(async () => {
            console.log(`\n${new Date(Date.now())}: Successfully compiled "${repo}".`)

            await moveJarFile(repoOwner, repo, branch, latestCommitHash)
            await moveLogFile(repoOwner, repo, branch, latestCommitHash)

            resolve()
        }).catch(async (err) => {
            // on failed compile, move build.txt file to commit folder
            await moveLogFile(repoOwner, repo, branch, latestCommitHash)

            reject(err)
        })
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
function checkCommitMessage(repo, commitMessage){
    try {
        if(commitMessage.includes('[ci skip]') || commitMessage.includes('[CI SKIP]')){
            console.log(`\n${new Date(Date.now())}: "ci skip" detected in commit message, skipping "${repo}" clone and build.`)

            return true
        } 
        
        return false
    } catch (error) {
        throw new Error(`\n${new Date(Date.now())}: Check "${repo}" commit message error encountered, please debug locally.`)
    }
}

/**
 * @description check if a commit folder exist in the cloned builds
 * repo where the output jar and log file will be transferred
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned remote repo
 * @param {String} branch repo branch 
 * @param {String} latestCommitHash the latest commit hash for the cloned repo
 */
async function checkBuildsRepoCommitDir(repoOwner, repo, branch, latestCommitHash){
    try {
        // an commit named folder exist, 
        if(!latestCommitHash) {
            console.log(`\n${new Date(Date.now())}: Skipped clone and compile "${repo}" due to no new remote commits.`)

            return true
        }
 
        // throws an error if path does not exist
        await access(`./cloned_repos/${repos[0].github_username}/${repos[0].repository}/repos/${repoOwner}/${repo}/${branch}/${latestCommitHash}`) 

        console.log(`\n${new Date(Date.now())}: Skipped clone and compile "${repo}" due no new commits.`)
        
        return true
    } catch (error) {
        return false
    }
}

/**
 * @description creates a commit named folder inside cloned builds repo
 * by utilizing compiled repo properties as the folder path names
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned remote repo
 * @param {String} branch repo branch 
 * @param {String} latestCommitHash the latest commit hash for the cloned repo
 */
async function createBuildsRepoCommitDir(repoOwner, repo, branch, latestCommitHash){
    return new Promise(async (resolve, reject) => {
        try {
            const buildsRepoCommitPath = join('cloned_repos', repos[0].github_username, repos[0].repository, 'repos', repoOwner, repo, branch, latestCommitHash)

            await child_process(`mkdir "${buildsRepoCommitPath}"`)
    
            console.log(`\n${new Date(Date.now())}: Created a commit directory inside cloned builds repo "${`./cloned_repos/${repos[0].github_username}/${repos[0].repository}/repos/${repoOwner}/${repo}/${branch}/${latestCommitHash}`}".`)
            
            resolve()
        } catch (error) {
            reject(error)
        }
    })
}

/**
 * @description moves the output jar file out of the cloned
 * repo target folder into the cloned builds repo directory
 * 
 * @param {String} repoOwner the repo owner username
 * @param {String} repo the name of the cloned remote repo
 * @param {String} branch repo branch 
 * @param {String} latestCommitHash the latest commit hash for the cloned repo
 */
async function moveJarFile(repoOwner, repo, branch, latestCommitHash){
    try {
        const buildFilePath = join('cloned_repos', repoOwner, repo, 'target', "*.jar")
        const targetPath = join('cloned_repos', repos[0].github_username, repos[0].repository, 'repos', repoOwner, repo, branch, latestCommitHash)

        await child_process(`${moveCmd} ${buildFilePath} ${targetPath}`)

        console.log(`\n${new Date(Date.now())}: Successfully transferred jar file for "${repo}".`)
    } catch(error) {
        throw new Error(`\n${new Date(Date.now())}: An error has occured when moving the jar file for "${repo}": \n` + error)   
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
 * @param {String} latestCommitHash the latest commit hash for the cloned repo
 */
async function moveLogFile(repoOwner, repo, branch, latestCommitHash){
    try {
        const buildFilePath = join('cloned_repos', repoOwner, repo, "build.txt")
        const targetPath = join('cloned_repos', repos[0].github_username, repos[0].repository, 'repos', repoOwner, repo, branch, latestCommitHash)

        await child_process(`${moveCmd} ${buildFilePath} ${targetPath}`)

        console.log(`\n${new Date(Date.now())}: Successfully transferred build logs for "${repo}".`)
    } catch(error) {
        throw new Error(`\n${new Date(Date.now())}: Error encountered while transferring build logs for "${repo}". please debug locally. \n:` + error)  
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
            const buildsRepoPath = join('cloned_repos', repos[0].github_username, repos[0].repository)

            await child_process(`cd ${buildsRepoPath} && ${setConfUser} && git add . && ${gitCommit} && git push origin`)
          
            console.log(`\n${new Date(Date.now())}: Successfully committed changes to remote builds repository (${repos[0].repository}).`)

            resolve()
        } catch (error) {
            reject(`\n${new Date(Date.now())}: Nothing to commit on remote builds repository (${repos[0].repository}).`) 
        }
    }).catch((error) => console.error(error))
}

module.exports = { start, getRepoResource }
