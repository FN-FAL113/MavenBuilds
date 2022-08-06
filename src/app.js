// Author: FN_FAL113 (https://github.com/FN-FAL113/)
// License: GNU General Public License v3.0
const {start, cloneRepo, buildAndTransferFiles, commitToBuilds} = require('./main')

require('dotenv').config();

startTask();  

async function startTask(){ 
    const repos = await start()
    
    await cloneRepo(repos)
    
    await buildAndTransferFiles(repos)

    await commitToBuilds(repos)
}
