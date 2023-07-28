# MavenBuilds

"Continous Integration/Deployment Service" for java maven packages

Maven packages are uploaded to this repo unless builds repo is edited inside ```./resources/repos.json```.<br>
Defaults to ```clean package``` lifecycle build.

## :interrobang: The Process

### 1. Cloning builds and target repos
remote builds repo is cloned (first object inside resource file).

Each object (target repo) starting from index 1 inside resource<br/>
file are looped for cloning, building and remote push.<br/><br/>
If there are existing local directories, it will be<br/>
automatically deleted before starting the cloning process

Cloned repositories directory:

``./cloned_repos/{repoOwner}/<cloned repo dirs>``<br/>


### 2. Creation of build output directories for each target repo
Before proceeding to maven lifecycle build, the latest commit hash from a target repo is fetched to check whether a commit hash named subdirectory exists.

If a commit hash named subdirectory exist then maven lifecycle build is skipped<br/>
otherwise the build output directories are created inside the cloned builds<br/>
repo where it takes the target repo object properties as subdirectories.

<a name="builds_output_directory">Builds Output Directory:</a>
```
./cloned_repos/{buildsRepoOwner}/{buildsRepoName}/repos/{targetRepoOwner}/{targetRepoName}/{branch}/{latestCommitHash}
```

### 3. Building target repo
After successfully creating the build output directories if no commit hash 
subdirectory exist, a maven lifecycle build gets initiated using<br/> 
'clean package' as the command. The build log gets created<br/>
in the root directory of the current target repo. 

### 4. Transferring target repo build files
If maven lifecycle build is successful then output files which are the packaged<br/>
jar and build log else get transferred to the aforementioned [cloned builds output directory](#builds_output_directory) else only log file will get transferred<br/>

### 5. Commit and push to builds repo
After looping the target repos, we commit and push any changes to the builds repo, these changes are any created commit hash directory where build files are transffered.<br/>

## Assigning builds repo and target repos
Inside ```./resources/repos.json```, where you will be adding the needed builds repo and target repos<br/>
Contents are inside a json literal array<br/>
```
[
    /* index 0 of this json array that serves as your main builds repo
     * where the packaged jar and other files will be committed
    /* 
    {
        "github_username": "FN-FAL113",
        "repository": "MavenBuilds",
        "branch": "main"
    },
    /* index 1 above are your target java maven repos 
     * each repository should be added per index inside this json array
    /* keep in mind, index 0 should be the main builds repository
    { 
        "github_username": "FN-FAL113",
        "repository": "FN-FAL-s-Amplifications",
        "branch": "main"
    },
    {
        "github_username": "FN-FAL113",
        "repository": "RelicsOfCthonia",
        "branch": "main"
    }
]
```

## To Do
- Feel free to suggest

## Usage
1. Clone this maven builds repo then extract the zip file

2. Run ```npm install```

3. Assign your own builds and target github repos inside ```/resources/repos.json```

4. Change the maven build lifecycle command if necessary inside ```main.js```

5. Supply needed environment variables like ```API_KEY``` and ```EMAIL```, propagate github action secrets if necessary<br/>

6. Execute the app ```npm start```

## CI/CD Through Github Actions
- An example workflow I made for this builds repo: [deploy.yml](https://github.com/FN-FAL113/MavenBuilds/blob/main/.github/workflows/deploy.yml)
- An example workflow that I also wrote for a target repo that triggers the workflow for this builds repo on push: [deploy.yml](https://github.com/FN-FAL113/FN-FAL-s-Amplifications/blob/main/.github/workflows/deploy.yml)
