// The needed environment variables must be supplied through .env file or github repo secrets
// Error messages are commented out for security reasons, it must be debugged
// locally and reject() promises must be supplied with the referenced error e.g reject(error) 
// Author: FN_FAL113 (https://github.com/FN-FAL113/)
// License: GNU General Public License v3.0

const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const child_proc = require('child_process')
const { JSDOM } = require("jsdom");
const { delDirectoryIfExist } = require('./main')

require('dotenv').config()

let dom = null;
let commitHash = []

const repoOwner = "FN-FAL113"
const repos = ['FN_FAL113-Pages', 'MavenBuilds']


start()

async function start(){
    await delDirectoryIfExist('./repos')

    await cloneRepos(repoOwner, repos)
    
    dom = await getBuildsPage()
   
    await getLocalDirRecursively(`./repos/${repos[1]}/repos/`)

    commitHash = await sortByDate()

    // use dir.split('\\') for windows, dir.split('/') for linux
    for(const dir of commitHash){
        console.log(`\nProcessing commit: ` + dir.directory + "\nDate:" + dir.date)
        
       const buildFilesArray = await getBuildFiles(dir.directory.split('/'))
        
       await setupBuildsPage(dir, buildFilesArray)
    }

    console.log(`\nFinished all task!`)

    await commitToBuildsPage()
}

function sortByDate(){
    return new Promise((resolve, reject) =>{
        commitHash.sort((a, b) =>{
            return new Date(b.date) - new Date(a.date)
        }).reverse()

        resolve(commitHash)
    }).catch(() => console.error(`Sort by date error enountered`))
}

function cloneRepos(repoOwner, repos){
    return new Promise((resolve, reject) =>{
        const clonePromises = []; 

        for (const repo of repos) {
            clonePromises.push(new Promise ((resolve, reject) => {
                child_proc.exec(`git clone https://${repoOwner}:${process.env.API_KEY}@github.com/${repoOwner}/${repo}.git repos/${repo}`, (error, stdout, stderr) => {                    
                    console.log(`\nCloning ${repo}`);
                
                    resolve()
                })
            }).catch(() => console.error(`Cloning ${repo} error enountered`)))
        }
        
        Promise.all(clonePromises).then(() => resolve())
    }).catch(() => console.error('Clone repo error encountered'))
}

function getBuildsPage(){
    return new Promise(async (resolve, reject) =>{
       resolve(await JSDOM.fromFile(`./repos/${repos[0]}/src/builds.html`))
    })
}

function getLocalDirRecursively(dir){
    return new Promise(async (resolve, reject) => {
        fs.readdir(dir, async function (err, files) {
            
            if (err) {            
                return reject() 
            } 

            for (const file of files) {
                const currentDirectory = path.join(dir, file)
                if(fs.lstatSync(currentDirectory).isDirectory()){    
                    await getLocalDirRecursively(currentDirectory)
                } else {
                    const dirArray = dir.split('/')
                    const user = dirArray[3]
                    const repo = dirArray[4]
                    const commit_hash = dirArray[6]

                    const commitData = await getCommitDetails(user, repo, commit_hash)

                    const dirData = { directory: `${dir}`, date: `${commitData.commit.author.date}`, commit_message: `${commitData.commit.message}` }

                    if(!commitHash.some(entry => entry.directory === dirData.directory)){
                        commitHash.push(dirData)
                    }
                }

            }
            
            resolve()
        })
    }).catch(() => console.error(`Get local dir recursively error enountered`))
}

function parseToFile(dom, repo, commitHash){
    return new Promise((resolve, reject) =>{
        fs.writeFile(`./repos/${repos[0]}/src/builds.html`, dom.serialize(), 'utf8', (error) =>{
            if(error){
                console.error(`An error occured while writing serialized dom to file`)
                
                reject(error)

                return
            }

            console.log(`\nSuccessfully written ${repo}:${commitHash} serialized dom to builds.html!`)
            
            resolve()
        })
    }).catch(() => console.error(`Parse to file error enountered`))
}

function getBuildFiles(dir){
    return new Promise((resolve, reject) =>{
        fs.readdir(dir.join("/"), function (error, files) {
            if (error) {
                console.error(`An error occured while reading the directory`)

                reject()
            }

           resolve(files)
        });
    }).catch(() => console.error(`Get build files error enountered`))
}

function setupBuildsPage(commitData, buildFilesArray){
    return new Promise(async (resolve, reject) =>{
        const obj = commitData.directory.split('/')
        const user = obj[3]
        const repo = obj[4]
        const commitHash = obj[6]

        const elementContainer = dom.window.document.querySelector("div.maindiv")
        const repoDiv = dom.window.document.querySelector(`div.${repo.toLowerCase()}`)
        
        if(repoDiv == null){
            const modalDiv = dom.window.document.createElement('div')
            modalDiv.className = `row rounded mx-auto mb-3 mt-5 bgOpaqueDark ${repo.toLowerCase()}`
            modalDiv.innerHTML = createAddonDiv(repo)
            
            elementContainer.appendChild(modalDiv) 
        }

        if(!dom.window.document.querySelector(`div.${repo.toLowerCase()}`).innerHTML.includes(commitHash)){
            const domFinal = await appendToAddonDiv(dom, obj, buildFilesArray, commitData)

            await parseToFile(domFinal, repo, commitHash)

            resolve()
        } else { 
            reject(`\nSkipping existing commit hash build: ${commitHash}`)
        }
    }).catch((error) => console.error(error))
}

async function getCommitDetails(user, repo, commitHash){
    return new Promise(async (resolve, reject) => {
        try{
            const response = await fetch(`https://api.github.com/repos/${user}/${repo}/commits/${commitHash}`, {
                method: 'GET',
                headers: {
                    'Authorization': 'token ' + `${process.env.API_KEY}` 
                }
            })
            const data = await response.json()
                
            resolve(data)
        } catch(error){
            reject()
        }
    }).catch(() => console.error(`Get commit details error enountered`))
}

function appendToAddonDiv(dom, dir, buildFilesArray, commitData){
    return new Promise((resolve, reject) =>{
        const addonDiv = dom.window.document.querySelector(`div.${dir[4].toLowerCase()}`);

        const innerDiv = dom.window.document.createElement('div')

        innerDiv.className = "col-auto mx-auto text-center py-2";

        addonDiv.appendChild(innerElementButtonModal(innerDiv, dir, buildFilesArray, commitData));

        resolve(dom)
    }).catch(() => console.error(`Append to addon div error enountered`))
}

function createAddonDiv(addon){
    return `
        <div class="row rounded mx-auto bgOpaqueDark">
            <div class="col-8 mx-auto">
                <h3 class="text-center text-dark mt-1">${addon}</h1>
            </div>
        </div>\n`
}

function innerElementButtonModal(innerDiv, dir, buildFilesArray, commitData){
    const commitHash = dir[6]
    const commitHashLowerCase = dir[6].toLowerCase()
    const user = dir[3]
    const repo = dir[4]
    const branch = dir[5]

    const buildStatus = buildFilesArray.length > 1 ? 'Success' : 'Failure'

    const buildModalBody = buildFilesArray.length > 1 ? 
    `<div class="modal-body"><strong>Build Files:</strong></div>
    <div class="modal-body"><a href="https://github.com/FN-FAL113/MavenBuilds/raw/main/repos/${user}/${repo}/${branch}/${commitHash}/${buildFilesArray[0]}" target="_blank">${buildFilesArray[0]}</a></div>
    <div class="modal-body"><a href="https://github.com/FN-FAL113/MavenBuilds/raw/main/repos/${user}/${repo}/${branch}/${commitHash}/${buildFilesArray[1]}" target="_blank">${buildFilesArray[1]}</a></div>` 
    :
    `<div class="modal-body"><strong>Build Files:</strong></div>
    <div class="modal-body"><a href="https://github.com/FN-FAL113/MavenBuilds/raw/main/repos/${user}/${repo}/${branch}/${commitHash}/${buildFilesArray[0]}" target="_blank">${buildFilesArray[0]}</a></div>` 
    

    innerDiv.innerHTML = `
        <button type="button" class="btn btn-sm btn-primary fadeIn" data-toggle="modal" data-target="#exampleModal${commitHashLowerCase}">
        ${commitHash}
        </button>
    
        <div class="modal text-start fadeIn" data-backdrop="false" id="exampleModal${commitHashLowerCase}" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-fill" role="document">
                <div class="modal-content bgOpaqueDarkModal com-${commitHashLowerCase}">
                    
                    <div class="modal-header border-bottom border-primary" style="border: none;">
                        <h5 class="modal-title mx-auto" id="exampleModalLabel"><a href="https://github.com/${user}/${repo}/commit/${commitHash}" target="_blank">Commit #${commitHash}</a></h5>
                        <button type="button" class="close btn btn-info" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">X</span>
                        </button>
                    </div>
                    
                    <div class="modal-body"><strong>Build Status:</strong> <br/><br/>${buildStatus}</div>
                    <div class="modal-footer"></div>
                    ${buildModalBody}
                    <div class="modal-footer"></div>
                    <div class="modal-body"><strong>Commit Date:</strong> <br/><br>${new Date(commitData.date).toString()}</div>
                    <div class="modal-footer"></div>
                    <div class="modal-body"><strong>Commit Description:</strong> <br/><br>${commitData.commit_message}</div>
                    <div class="modal-footer"></div>
        
                </div>
            </div>
        </div>`;

        return innerDiv;
}

function commitToBuildsPage() {
    return new Promise((resolve, reject) => {
        const setConfUser = `git config user.name FN-FAL113 && git config user.email ${process.env.EMAIL}`
        const gitCommit = `git commit -m "${process.env.ACTION_NAME} #${process.env.RUN_ID}"`
        
        child_proc.exec(`cd ./repos/${repos[0]}/ && ${setConfUser} && git add . && ${gitCommit} && git push origin`, (error, stdout, stderr) => {
            if (error) {   
                reject(`\nNothing to commit on ${repos[0]} remote repository`)
            } else {
                console.log(`\nSuccessfully committed changes ${repos[0]} remote repository!`)

                resolve()
            }
        })
    }).catch((error) => console.error(error))
}

