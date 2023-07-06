# MavenBuilds

"Continous Integration/Deployment Service" for java maven packages

Maven packages are uploaded to this repo unless builds repo is edited inside ```./resources/repos.json```<br>
Defaults to ```mvn clean package```

## How it works

### 1. Cloning
This current build repo gets cloned and used as local directory<br/>
for other target repos that will be worked on which are retrieved<br/>
inside the ```./resources/repos.json file<br/>
Each index starting from index 1 are queued for cloning<br/>
If there are local repositories cached, it will be<br/>
automatically deleted before starting the cloning process

Cloned repositories directory:

``./cloned_repos/{username}/<cloned repo dirs>``<br/>

### 2. Setting pom final name
Once a target repo gets cloned, the maven pom.xml for each repository<br/>
is parsed as jsonObject where the build.finalName will be set<br/>
as "project.name vproject.version" and be used as the package name<br/>
for the jar after a successful maven lifecycle build

### 3. Creation of build output directories
Before proceeding to maven lifecycle build, build output directories are created<br/>
inside the cloned builds repo where it takes the target repo owner username,<br/>
repo name, branch and the current/latest commit hash as the subdirectories.

<a name="builds_output_directory"></a>
```
Build output Directory:

./cloned_repos/{username}/{buildsRepo}/repos/{username}/{repo}/{branch}/{currentCommitHash}
```

If the current commit hash from the target repo exist as subdirectory<br/>
then maven build for that specific repo will be skipped since there are no new commits<br/>

### 4. Maven Build
After successfully creating the build output directories which means there are<br/>
new commits from our target repository, a maven lifecycle build gets initiated using<br/>
'clean package' as the command. The logs for the build gets outputted in the<br/>
root directory of the target repo. 

### 5. Transferring build files
If the build for a repo is successfull then build files including the packaged<br/>
jar and build log else only log file get transferred to the aforementioned [cloned builds output directory](build_output_directory)<br/>

### 6. Commit to build repo
Lastly, we commit our changes to the builds repo, the changes includes our<br/>
transferred build files that are stored in the build output<br/>
directories which will get reflected upon git commit and git push.<br/>

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
- refactoring (cleaning up mess if necessary)
- modulation

## Usage
1. Clone this maven builds repo then extract the zip file

2. Delete ```./repos/``` folder from root dir if exist
 
3. Run ```npm install```

4. Assign your own builds and target github repos inside ```/resources/repos.json```

5. Change the maven build life cycle command if necessary inside main.js

6. Supply needed environment variables like ```API_KEY``` and ```EMAIL```, propagate github action secrets if necessary<br/>

7. Run ```npm start```

## CI/CD Through Github Actions
- An example workflow I made for this builds repo: [deploy.yml](https://github.com/FN-FAL113/MavenBuilds/blob/main/.github/workflows/deploy.yml)
- An example workflow that I also wrote for a target repo that triggers the deploy workflow file on this builds repo on push: [deploy.yml](https://github.com/FN-FAL113/FN-FAL-s-Amplifications/blob/main/.github/workflows/deploy.yml)
