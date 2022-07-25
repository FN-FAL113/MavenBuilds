// The needed environment variables must be supplied through .env file or github repo secrets
// Error messages are commented out for security reasons, it must be debugged
// locally and reject() promises must be supplied with the referenced error e.g reject(error) 
// Author: FN_FAL113 (https://github.com/FN-FAL113/)
// License: GNU General Public License v3.0

const child_proc = require('child_process')
const mvn = require('maven')
const pomParser = require('pom-parser')
const {access, rm, readFile, writeFile} = require('fs');
const path = require('path');
const xml2js = require('xml2js');


const start = () => {
    return getRepoResource()
}

function getRepoResource(){
    return new Promise((resolve, reject) =>{
        readFile('./resources/repos.json', 'utf8', function (error, data) {
            if (error){
                console.error(`\nGet repos.json error encountered`)

                reject()
            }
    
            resolve(JSON.parse(data))
        })
    })
}

function cloneRepo(repos){
    return new Promise((resolve, reject) =>{    
        const deleteDirpromises = []; 
        const clonePromises = []; 

        for(let i = 0; i < repos.length; i++) { // push deleteDir promises in array
            if(i != 0){
                deleteDirpromises.push(
                    delDirectoryIfExist(`./repos/${repos[i].github_username}/${repos[i].repository}`)
                )
            }
        } 

        Promise.all(deleteDirpromises).then(() => {
            for(let i = 0; i < repos.length; i++) {
                // we loop through repos.json and check if it has a stored locally 
                // if it exist then it gets deleted and a new clone gets initiated
                const repo = repos[i].repository
                const repoOwner = repos[i].github_username
                const branch = repos[i].branch

                clonePromises.push(new Promise((resolve, reject) => { // push gitClone promises in array
                   child_proc.exec(`git clone -b ${branch} https://${repos[0].github_username}:${process.env.API_KEY}@github.com/${repoOwner}/${repo}.git repos/${repoOwner}/${repo}`, (error, stdout, stderr) => {                    
                        console.log(`\nCloning ${repo}!`);
                       
                        i == 0 ? reject() : resolve()
                   })
                }).then(() => setPomFinalName(repoOwner, repo)).catch(() => console.log(`\nSkipping setPom for the builds repo`)))
            }
   
            Promise.all(clonePromises).then(() => resolve(repos))
        })
    }).catch(() => console.error('Clone repo error encountered'))
}

function delDirectoryIfExist(path){
    return new Promise((resolve, reject) => {
        access(path, (error) => {
            if(error){ // path doesn't exist, proceed to cloning
                resolve()

                return;
            }

            rm(path, { maxRetries: 5, retryDelay: 2000, recursive: true, force: true }, (err) => {
                console.log(`\nDeleting local repo: ${path}`)

                resolve()
            }) 

        }); 
    })      
}

function setPomFinalName(username, repo){
    return new Promise((resolve, reject) => {
        // read XML file
         readFile(`./repos/${username}/${repo}/pom.xml`, "utf-8", (error, data) => {
            if (error) {
                console.error(`\nReadFile ${repo} pom.xml error encountered: ` + error)

                reject()
            }

            // convert XML data to JSON object
            xml2js.parseString(data, (err, result) => {
                if (err) {
                    console.error(`\nParse ${repo} pom.xml to jsonObject error encountered`)

                    reject()
                }
            
                result.project.build[0].finalName = ['${project.name} v${project.version}']

                // convert JSON object to XML
                const builder = new xml2js.Builder();
                const xml = builder.buildObject(result);

                // write updated XML string to a file
                // overrites the pom file, we don't want to append it
                writeFile(`./repos/${username}/${repo}/pom.xml`, xml, (error) => {
                    if (error) {
                        console.error(`\nWrite ${repo} parsed jsonObject to pom.xml error encountered`)

                        reject()
                    }
                    
                    console.log(`\nSuccessfully updated ${repo} pom.xml`);
                    resolve()
                });

            });
        });

    }).catch(() => console.error('Set pom final name error encountered' /* + error */))
}

function buildAndTransferFiles(repos){
    return new Promise((resolve, reject) =>{
        const promises = []

        try{
            for(let i = 1; i < repos.length; i++) {
                const repo = repos[i].repository
                const repoOwner = repos[i].github_username
                const branch = repos[i].branch
                const buildsRepo = repos[0].repository

                console.log(`\nCompiling ${repo}`)

                promises.push(createRepoDir(repoOwner, repo, branch, buildsRepo)
                    .then((isExistingCommit) => new Promise((resolve, reject) => {

                            if(isExistingCommit){
                                reject(false)

                                return;
                            }
                            
                            mvn.create({
                                // the working directory that maven will build upon
                                cwd: `./repos/${repoOwner}/${repo}`,
                            }).execute(['clean', 'package' ,`-lbuild.txt`], { 'skipTests': true }).then(() => {
                                console.log(`\nSuccessfully compiled ${repo}`)

                                resolve(false)
                            }).catch(() => {
                                console.log(`\nUnsuccessfully compiled ${repo}`)
                                
                                moveLogFile(repoOwner, repo, branch, buildsRepo)

                                reject(true)
                            })
                        })

                    ).then(() => moveJarFile(repoOwner, repo, branch, buildsRepo))
                        .then(() => moveLogFile(repoOwner, repo, branch, buildsRepo))
                            .catch((failBuild) => console.log(failBuild ? `\n${repo} failed build, check build.txt for more info` : `\nSkipped compiling ${repo} due to no new commits`))
                )       
            }

            Promise.all(promises).then(() => resolve(repos))
        } catch(error){
            console.error('Maven compile error encountered' /* + error */)  
        }
    })
}

function createRepoDir(username, repo, branch, buildsRepo){
    return new Promise((resolve, reject) => {
        const currentCommit = getCurrentCommitHash(username, repo)
        const mkdirArgs = `mkdir "./repos" "./repos/${username}" "./repos/${username}/${repo}" "./repos/${username}/${repo}/${branch}" "./repos/${username}/${repo}/${branch}/${currentCommit}"`
        
        access(`./repos/${username}/${buildsRepo}/repos/${username}/${repo}/${branch}/${currentCommit}`, (error) => {
            if(error){ // path doesn't exist, proceed to compilation
                child_proc.exec(`cd ./repos/${username}/${buildsRepo} && ${mkdirArgs}`, (error, stdout, stderr) => {
                    console.log(`\n${repo} build output directory created`)
        
                    resolve(false)
                })
            } else {
                resolve(true)
            }
        }); 
    })
}

function moveJarFile(username, repo, branch, buildsRepo){
    return new Promise((resolve, reject) => {
        pomParser.parse({ filePath: path.join(__dirname, '../') + `/repos/${username}/${repo}/pom.xml` }, (error, pomResponse) => {
            if (error) {
                console.error(`\n${repo} pom parse error encountered`);

                reject()
            }

            const pomObject = pomResponse.pomObject.project
            
            const jarName = `"` + pomObject.name + " v" + pomObject.version + ".jar" + `"`
   
            const moveJarFileArgs = `cd ./repos/${username}/${repo}/target && mv ${jarName} ../../${buildsRepo}/repos/${username}/${repo}/${branch}/${getCurrentCommitHash(username, repo)}` 

            child_proc.exec(`${moveJarFileArgs}`, (error, stdout, stderr) => {
                if (error) {            
                    console.error(`\nError encountered while transferring ${repo} jar file`);

                    reject()
                } else {
                    console.log(`\nSuccessfully transferred ${repo} jar file`)

                    resolve()
                }  
            })     
        })
    }).catch(() => console.error('Move jar file error encountered' /*+ error */))
}

function moveLogFile(username, repo, branch, buildsRepo){
    return new Promise((resolve, reject) => {
        const moveBuildLogArgs = `cd ./repos/${username}/${repo} && mv "build.txt" ../${buildsRepo}/repos/${username}/${repo}/${branch}/${getCurrentCommitHash(username, repo)}`

        child_proc.exec(`${moveBuildLogArgs}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`\nError encountered while transferring ${repo} build logs!`)

                reject()    
            } else {
                console.log(`\nSuccessfully transferred ${repo} build logs`)

                resolve()
            }
        })
    }).catch(() => console.error('Move log file error encountered' /* + error */ ))
}

function getCurrentCommitHash(username, repo){
    // we use #trim to remove white spaces at the end of the current commit hash being ommitted by converting a cmd command response to string
    const commitHash = child_proc.execSync(`cd ./repos/${username}/${repo} && git rev-parse --short=7 HEAD`).toString().trim()

    return commitHash
}

function commitToBuilds(repos){
    return new Promise((resolve, reject) => {
        const setConfUser = `git config user.name FN-FAL113 && git config user.email ${process.env.EMAIL}`
        const gitCommit = `git commit -m "${process.env.ACTION_NAME} #${process.env.RUN_ID}"`
        
        child_proc.exec(`cd ./repos/${repos[0].github_username}/${repos[0].repository}/ && ${setConfUser} && git add . && ${gitCommit} && git push origin`, (error, stdout, stderr) => {
            if (error) {         
                reject(`\nNothing to commit on ${repos[0].repository} remote repository`)
            } else {
                console.log(`\nSuccessfully committed changes ${repos[0].repository} remote repository!`)

                resolve()
            }
        })
    }).catch((error) => console.error(error))
}

module.exports = { start, cloneRepo, buildAndTransferFiles, commitToBuilds}
