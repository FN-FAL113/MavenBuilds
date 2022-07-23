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

const start = (username = null, repo = null, branch = null) => {
    return new Promise((resolve, reject) =>{
        if(repo.length < 1 || username == null || branch == null){
            reject('Parameters cannot be null!')
        }
    
        resolve()
    })
}

function cloneRepo(username = null, repo, branch){
    return new Promise((resolve, reject) =>{    
        const deleteDirpromises = []; 
        const clonePromises = []; 

        for(let i = 0; i < repo.length; i++) { // store deleteDir promises in array
            if(i != 0){
                deleteDirpromises.push(
                    delDirectoryIfExist(`./repos/${username}/${repo[i]}`)
                )
            }
        } 

        Promise.all(deleteDirpromises).then(() => {
            for(let i = 0; i < repo.length; i++) {
                // we loop through the repositories and check if it has a stored locally 
                // if it exist then it gets deleted and a new clone gets initiated
                clonePromises.push(new Promise((resolve, reject) => { // store gitClone promises in array
                   child_proc.exec(`git clone https://${username}:${process.env.API_KEY}@github.com/${username}/${repo[i]}.git repos/${username}/${repo[i]}`, (error, stdout, stderr) => {                    
                        console.log(`Cloning ${repo[i]}!`);
                       
                        i == 0 ? reject() : resolve()
                   })
                }).then(() => setPomFinalName(username, repo[i])).catch(() => console.log('Skipping setPom for the builds repo')))
            }
   
            Promise.all(clonePromises).then(() => resolve())
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
                console.log(`Deleting local repo: ${path}`)

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
                console.error(`ReadFile ${repo} pom.xml error encountered`)

                reject()
            }

            // convert XML data to JSON object
            xml2js.parseString(data, (err, result) => {
                if (err) {
                    console.error(`Parse ${repo} pom.xml to jsonObject error encountered`)

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
                        console.error(`Write ${repo} parsed jsonObject to pom.xml error encountered`)

                        reject()
                    }
                    
                    console.log(`Updated ${repo} pom.xml is written to a new file`);
                    resolve()
                });

            });
        });

    }).catch(() => console.error('Set pom final name error encountered' /* + error */))
}

function buildAndTransferFiles(username, repo, branch){
    return new Promise((resolve, reject) =>{
        const promises = []

        try{
            for(let i = 1; i < repo.length; i++) {
                console.log('Compiling ' + repo[i])

                promises.push(createRepoDir(username, repo[i], repo[0], branch)
                    .then((isExistingCommit) => new Promise((resolve, reject) => {

                            if(isExistingCommit){
                                reject(false)

                                return;
                            }
                            
                            mvn.create({
                                // the working directory that maven will build upon
                                cwd: `./repos/${username}/${repo[i]}`,
                            }).execute(['clean', 'package' ,`-lbuild.txt`], { 'skipTests': false }).then(() => {
                                console.log(`Successfully compiled ${repo[i]}`)

                                resolve(false)
                            }).catch(() => {
                                console.log(`Unsuccessfully compiled ${repo[i]}`)
                                
                                moveLogFile(username, repo[i], branch)

                                reject(true)
                            })
                        })

                    ).then(() => moveJarFile(username, repo[i], branch))
                        .then(() => moveLogFile(username, repo[i], branch))
                            .catch((failBuild) => console.log(failBuild ? `${repo[i]} failed build, check build.txt for more info` : `Skipped compiling ${repo[i]} due to no new commits`))
                )       
            }

            Promise.all(promises).then(() => resolve())
        } catch(error){
            console.error('Maven compile error encountered' /* + error */)  
        }
    });
}

function createRepoDir(username, repo, buildsRepo, branch){
    return new Promise((resolve, reject) => {
        const currentCommit = getCurrentCommitHash(username, repo)
        const mkdirArgs = `mkdir "./repos" "./repos/${username}" "./repos/${username}/${repo}" "./repos/${username}/${repo}/${branch}" "./repos/${username}/${repo}/${branch}/${currentCommit}"`
        
        access(`./repos/${username}/${buildsRepo}/repos/${username}/${repo}/${branch}/${currentCommit}`, (error) => {
            if(error){ // path doesn't exist, proceed to compilation
                child_proc.exec(`cd ./repos/${username}/${buildsRepo} && ${mkdirArgs}`, (error, stdout, stderr) => {
                    console.log(`${repo} build output directory created`)
        
                    resolve(false)
                })
            } else {
                resolve(true)
            }
        }); 
    })
}

function moveJarFile(username, repo, branch){
    return new Promise((resolve, reject) => {
        pomParser.parse({ filePath: path.join(__dirname, '../') + `/repos/${username}/${repo}/pom.xml` }, (error, pomResponse) => {
            if (error) {
                console.error(`${repo} pom parse error encountered`);

                reject()
            }

            const pomObject = pomResponse.pomObject.project
            
            const jarName = `"` + pomObject.name + " v" + pomObject.version + ".jar" + `"`
   
            const moveJarFileArgs = `cd ./repos/${username}/${repo}/target && mv ${jarName} ../../MavenBuilds/repos/${username}/${repo}/${branch}/${getCurrentCommitHash(username, repo)}` 

            child_proc.exec(`${moveJarFileArgs}`, (error, stdout, stderr) => {
                if (error) {            
                    console.error(`Error encountered while transferring ${repo} jar file`);

                    reject()
                } else {
                    console.log(`Successfully transferred ${repo} jar file`)

                    resolve()
                }  
            })     
        })
    }).catch((error) => console.error('Move jar file error encountered' /* + error */))
}

function moveLogFile(username, repo, branch){
    return new Promise((resolve, reject) => {
        const moveBuildLogArgs = `cd ./repos/${username}/${repo} && mv "build.txt" ../MavenBuilds/repos/${username}/${repo}/${branch}/${getCurrentCommitHash(username, repo)}`

        child_proc.exec(`${moveBuildLogArgs}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error encountered while transferring ${repo} build logs!`)

                reject()    
            } else {
                console.log(`Successfully transferred ${repo} build logs`)

                resolve()
            }
        })
    }).catch((error) => console.error('Move log file error encountered' /* + error */))
}

function getCurrentCommitHash(username, repo){
    // we use #trim to remove white spaces at the end of the current commit hash being ommitted by converting a cmd command response to string
    const commitHash = child_proc.execSync(`cd ./repos/${username}/${repo} && git rev-parse --short=7 HEAD`).toString().trim()

    return commitHash
}

function commitToBuilds(username, buildsRepo){
    return new Promise((resolve, reject) => {
        child_proc.exec(`cd ./repos/${username}/${buildsRepo}/ && git config user.name FN-FAL113 && git config user.email ${process.env.EMAIL} && git add . && git commit -m "${process.env.ACTION_NAME} #${process.env.RUN_ID}" && git push origin`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error encountered while committing changes to ${buildsRepo} repo!`);  
                
                reject()
            } else {
                console.log(`Successfully committed changes to ${buildsRepo} repo!`)

                resolve()
            }
        })
    }).catch((error) => console.error('Commit to builds error encountered' /*+ error*/))
}

module.exports = { start, cloneRepo, buildAndTransferFiles, commitToBuilds}