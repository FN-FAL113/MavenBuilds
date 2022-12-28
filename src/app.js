// Author: FN_FAL113 (https://github.com/FN-FAL113/)
// License: GNU General Public License v3.0
const { repoResources, cloneRepo, buildAndTransferFiles, commitPushToBuilds } = require('./main')

require('dotenv').config();

startTask();  

async function startTask(){ 
    const repos = await repoResources()
    
    await cloneRepo(repos)
    
    await buildAndTransferFiles(repos)

    await commitPushToBuilds(repos)
}
