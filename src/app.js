// Author: FN_FAL113 (https://github.com/FN-FAL113/)
// License: GNU General Public License v3.0
const {start, cloneRepo, buildAndTransferFiles, commitToBuilds} = require('./main')

require('dotenv').config();

const username = 'FN-FAL113' // change this to your github username
const repo1 = "FN-FAL-s-Amplifications"
const repo2 = "RelicsOfCthonia"
const branch = 'main'; // change this to the branch you want

const buildsRepo = "MavenBuilds"; // change this to the repo where the packaged jar will be committed to
const repoArray = [buildsRepo, repo1, repo2] // index 0 should be the main builds repo where package jar and files will be commited

function startTask(){ 
    start(username, repoArray, branch)
        .then(() => cloneRepo(username, repoArray, branch))
            .then(() => buildAndTransferFiles(username, repoArray, branch))
                .then(() => commitToBuilds(username, buildsRepo))
}

startTask();
  
