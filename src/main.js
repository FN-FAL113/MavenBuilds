// The needed environment variables must be supplied through .env file or github repo secrets
// Error messages are commented out for security reasons, it must be debugged
// locally and reject() promises must be supplied with the referenced error e.g reject(error) 
// Author: FN_FAL113 (https://github.com/FN-FAL113/)
// License: GNU General Public License v3.0

const child_proc = require('child_process')
const mvn = require('maven')
const pomParser = require('pom-parser')
const xml2js = require('xml2js')
const {access, rm, readFile, writeFile} = require('fs').promises
const path = require('path')
const util = require('util')

const pomParser_parse = util.promisify(pomParser.parse)
const xml2js_parse_string = util.promisify(xml2js.parseString)
const child_process = util.promisify(child_proc.exec)

require('dotenv').config()

const start = async () => getRepoResource()

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

            console.log(`\nCloning ${repository}!`);

            await child_process(`git clone -b ${branch} https://${repos[0].github_username}:${process.env.API_KEY}@github.com/${repoOwner}/${repository}.git repos/${repoOwner}/${repository}`)
            
            if(repository != repos[0].repository){               
                await setPomFinalName(repoOwner, repository)
            }
        }

        resolve()
    }).catch(() => console.error('Clone repo or delete directory error encountered: (debug locally)'))
}

function delDirectoryIfExist(path){
    return new Promise(async (resolve, reject) => {
        try {
            await access(path)
            
            console.log(`\nDeleting local repo: ${path}`)
            await rm(path, { maxRetries: 5, retryDelay: 2000, recursive: true, force: true })

            resolve()
        } catch (error) {
            console.log(`\nSkipping deletion for "${path}" because it doesn't exist`)

            resolve()
        }  
    })      
}

function setPomFinalName(username, repo){
    return new Promise(async (resolve, reject) => {
        try {
            // read XML file
            const data = await readFile(`./repos/${username}/${repo}/pom.xml`, 'utf8')
    
             // convert XML data to JSON object
            const result = await xml2js_parse_string(data)
            
            result.project.build[0].finalName = ['${project.name} v${project.version}']

            // convert JSON object to XML
            const builder = new xml2js.Builder();
            const xml = builder.buildObject(result);

            // write updated XML string to a file
            // overrites the pom file, we don't want to append it
            await writeFile(`./repos/${username}/${repo}/pom.xml`, xml)

            console.log(`\nSuccessfully updated ${repo} pom.xml`);
            resolve()
        } catch (error) {
            console.error(`\nSet ${repo} pom.xml error: ` + error)

            reject()
        }

    }).catch(() => console.error('Set pom final name error encountered: (debug locally)' /* + error */))
}

async function buildAndTransferFiles(repos){
    return new Promise(async (resolve, reject) =>{
        try{
            for(const repo of repos) {
                if(repo.repository === repos[0].repository){
                    continue
                }

                const repository = repo.repository
                const repoOwner = repo.github_username
                const branch = repo.branch
                const buildsRepo = repos[0].repository

                console.log(`\nCompiling ${repository}`)

                const ciSkip = await checkCommitMessage(repoOwner, repository)
                
                if(ciSkip){
                    continue
                }

                const isExistingCommit = await checkIfDirExist(repoOwner, repository, branch, buildsRepo)
              
                if(isExistingCommit){  
                    console.log(`\nSkipped compiling ${repository} due to no new commits`)

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

function mavenBuild(repoOwner, repo, branch, buildsRepo){
    return new Promise(async (resolve, reject) =>{
        mvn.create({
            // the working directory that maven will build upon
            cwd: `./repos/${repoOwner}/${repo}`,
        }).execute(['clean', 'package' ,`-lbuild.txt`], { 'skipTests': true }).then(async () => {
            console.log(`\nSuccessfully compiled ${repo}`)

            await moveJarFile(repoOwner, repo, branch, buildsRepo)
            await moveLogFile(repoOwner, repo, branch, buildsRepo)

            resolve()
        }).catch(async () => {
            console.log(`\nUnsuccessfully compiled ${repo}`)
            
            await moveLogFile(repoOwner, repo, branch, buildsRepo)

            reject()
        })
    }).catch(() => console.error('Maven build error encountered'))
}

function checkCommitMessage(repoOwner, repo){
    return new Promise(async (resolve, reject) => {
        const {err, stdout, stderr} = await child_process(`cd ./repos/${repoOwner}/${repo} && git log --format=%B -n 1`)
        const commitMessage = stdout.toString().trim()

        if(commitMessage.includes('[ci skip]') || commitMessage.includes('[CI SKIP]')){
            console.log(`\nSkipping ${repo} build because of commit message`)

            resolve(true)
        } else {
            resolve(false)
        }
    })
}

function checkIfDirExist(username, repo, branch, buildsRepo){
    return new Promise(async (resolve, reject) => {
        const currentCommit = await getCurrentCommitHash(username, repo)
        const mkdirArgs = `mkdir "./repos" "./repos/${username}" "./repos/${username}/${repo}" "./repos/${username}/${repo}/${branch}" "./repos/${username}/${repo}/${branch}/${currentCommit}"`
        
        try {
            await access(`./repos/${username}/${buildsRepo}/repos/${username}/${repo}/${branch}/${currentCommit}`)

            resolve(true)
        } catch (error) {
            await createRepoDir(username, repo, buildsRepo, mkdirArgs)
    
            resolve(false)
        }
    }).catch(() => console.error('Check if repo dir exist error encountered: (debug locally)'))
}

function createRepoDir(username, repo, buildsRepo, mkdirArgs){
    return new Promise(async (resolve, reject) => {
        child_proc.exec(`cd ./repos/${username}/${buildsRepo} && ${mkdirArgs}`, (error, stdout, stderr) => {
            console.log(`\n${repo} build output directory created`)

            resolve()
        })
    }).catch(() => console.error('Create repo dir error encountered: (debug locally)'))
}

function moveJarFile(username, repo, branch, buildsRepo){
    return new Promise(async (resolve, reject) => {
        try {
            const pomResponse = await pomParser_parse({ filePath: path.join(__dirname, '../') + `/repos/${username}/${repo}/pom.xml` })
    
            const pomObject = pomResponse.pomObject.project
            
            const jarName = `"` + pomObject.name + " v" + pomObject.version + ".jar" + `"`

            const commitHash = await getCurrentCommitHash(username, repo)
    
            const moveJarFileArgs = `cd ./repos/${username}/${repo}/target && mv ${jarName} ../../${buildsRepo}/repos/${username}/${repo}/${branch}/${commitHash}` 

            await child_process(`${moveJarFileArgs}`)

            console.log(`\nSuccessfully transferred ${repo} jar file`)
            resolve()
        } catch (error) {
            console.log(`\nError moving ${repo} jar file: ` + error)   

            reject()
        }
    }).catch(() => console.error('Move jar file error encountered: (debug locally)' /*+ error */))
}

function moveLogFile(username, repo, branch, buildsRepo){
    return new Promise(async (resolve, reject) => {
        const commitHash = await getCurrentCommitHash(username, repo)
        const moveBuildLogArgs = `cd ./repos/${username}/${repo} && mv "build.txt" ../${buildsRepo}/repos/${username}/${repo}/${branch}/${commitHash}`

        try {
            await child_process(`${moveBuildLogArgs}`)

            console.log(`\nSuccessfully transferred ${repo} build logs`)
    
            resolve()
        } catch (error) {
            console.error(`\nError encountered while transferring ${repo} build logs!`)
    
            reject()   
        }
    }).catch(() => console.error('Move log file error encountered: (debug locally)' /* + error */ ))
}

function getCurrentCommitHash(username, repo){
    return new Promise(async (resolve, reject) => {
        // we use #trim to remove white spaces at the end of the current commit hash being ommitted by converting a cmd command response to string
        const {err, stdout, stderr} = await child_process(`cd ./repos/${username}/${repo} && git rev-parse --short=7 HEAD`)

        resolve(stdout.toString().trim())
    })
}

async function commitToBuilds(repos){
    return new Promise(async (resolve, reject) => {
        const setConfUser = `git config user.name FN-FAL113 && git config user.email ${process.env.EMAIL}`
        const gitCommit = `git commit -m "${process.env.ACTION_NAME} #${process.env.RUN_ID}"`
        
        try{
            await child_process(`cd ./repos/${repos[0].github_username}/${repos[0].repository}/ && ${setConfUser} && git add . && ${gitCommit} && git push origin`)
          
            console.log(`\nSuccessfully committed changes ${repos[0].repository} remote repository!`)

            resolve()
        } catch (error) {
            reject(`\nNothing to commit on ${repos[0].repository} remote repository`)
        }
        
    }).catch((error) => console.error(error))
}

module.exports = { start, cloneRepo, buildAndTransferFiles, commitToBuilds, delDirectoryIfExist }