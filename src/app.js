// Author: FN_FAL113 (https://github.com/FN-FAL113/)
// License: GNU General Public License v3.0
const {start, cloneRepo, buildAndTransferFiles, commitToBuilds} = require('./main')

require('dotenv').config();

function startTask(){ 
    start()
        .then((repos) => cloneRepo(repos))
            .then((repos) => buildAndTransferFiles(repos))
                .then((repos) => commitToBuilds(repos))
}


startTask();  