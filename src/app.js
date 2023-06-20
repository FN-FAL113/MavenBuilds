// Author: FN_FAL113 (https://github.com/FN-FAL113/)
// License: GNU General Public License v3.0
const { getRepoResource, start } = require('./main')

async function startTask(){ 
    const repos = await getRepoResource()

    if(!repos) return

    await start(repos)
}

startTask(); 
