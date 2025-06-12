# MavenBuilds

"Continous Integration/Deployment Service" for java maven packages

Maven packages are uploaded to this repo unless builds repo is edited inside ```./resources/repos.json```.<br>
Defaults to ```clean package``` lifecycle build.

## :interrobang: The Process

### 1. Cloning builds and target repos
Existing local directories are deleted before executing this step.

Remote builds repo gets cloned (first object inside resource file).

Each target repo starting from index 1 inside resource file<br/>
are looped for cloning and building.<br/><br/>

Cloned repositories directory:

``./cloned_repos/{repoOwner}/<clonedRepoName>``<br/>

### 2. Creation of build output directories for each target repo
Before proceeding to maven lifecycle build, the latest commit hash from a target<br/>
repo is fetched to check whether a commit hash named subdirectory exists.

If a commit hash named subdirectory exist then maven lifecycle build will be skipped<br/>
otherwise the build output directories are created inside the builds repo.<br/>

<a name="builds_output_directory">Builds Output Directory:</a>
```
./cloned_repos/{buildsRepoOwner}/{buildsRepoName}/repos/{targetRepoOwner}/{targetRepoName}/{branch}/{latestCommitHash}
```

### 3. Building target repo
After creating the build output directories and no commit hash<br/> 
subdirectory exist, a maven lifecycle build is initiated using<br/> 
'clean package' as the life cycle command. The build log gets created<br/>
in the root directory of the current target repo. 

### 4. Transferring target repo build files
If maven lifecycle build is successful then output files (jar + logs) are the packaged<br/>
and transferred to the [cloned builds output directory](#builds_output_directory) else only log file will get transferred<br/>

### 5. Commit and push to remote builds repo
These changes are the new commit hash directory where the build files are transferred.<br/>

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
