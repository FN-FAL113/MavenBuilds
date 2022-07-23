# <img src="https://seeklogo.com/images/A/apache-logo-89257496F9-seeklogo.com.png" with="20px" height="25px"> MavenBuilds

"Continous Integration/Deployment Service" for java maven packages

## Brief explaination on how it works

### 1. Cloning
This current build repo gets cloned and used as local directory<br/>
for other target repos that will be worked on which are retrieved<br/>
from hardcoded repositories inside the app.js file that are stored<br/>
in a primitive array and queued for cloning. If there are local repositories<br/>
cached, it will be automatically deleted before starting the cloning process

Cloned repositories directory:
``./repos/{username}/<cloned repo dirs>``<br/>

### 2. Setting pom final name
Onced a target repo gets cloned, the maven pom.xml for each repository<br/>
gets parsed as jsonObject where the build.finalName will be set<br/>
as "project.name vproject.version" and be used as the package name<br/>
for the jar after compilation

### 3. Creation of build output directories
Before proceeding to maven build, build output directories are created<br/>
inside the clone of our said builds repo where it takes the username,<br/>
targetRepo, branch and the currentCommit hash as the subdirectories.

Build output Directory:
``./repos/{username}/{buildsRepo}/repos/{username}/{repo}/{branch}/{currentCommitHash}``<br/>

If the current commit hash from the target repo exist as a subdirectory<br/>
then maven build will be skipped since there are no new commits from our<br/>
target repo clone. Any skipped target repos automatically proceeds to<br/>
other target repos for build output directory creation and so on.

### 4. Maven Build
After successfully creating the build output directories which means there are<br/>
new commits from our target repo, a maven lifecycle build gets initiated using<br/>
'clean package' as the command. The logs for the build gets outputted in the<br/>
root directory of the target repo. 

### 5. Transferring build files
If the build for a repo is successfull then build files including the packaged<br/>
jar and build.txt else only build.txt get transferred to the aforementioned build<br/>
output directory above specifically.

### 6. Commit to build repo
Lastly, we commit our changes to the builds repo, the changes includes our<br/>
packaged jar and build.txt log file that are stored in the build<br/>
directories which will get reflected upon git commit and git push<br/>

## Assigning builds repo and target repos
This is inside from the ```./src/app.js``` from where you<br/>
can change the builds repo and add target repositories<br/><br/>
<img src="https://user-images.githubusercontent.com/88238718/180372206-e53b1561-701e-41cf-a282-bad773df002d.png" width="800px" heigh="650px">

## Usage
1. Clone this maven builds repo then extract the zip file

2. Delete ```./repos/``` folder from root dir if exist
 
3. Run ```npm install```

4. Assign your own builds and target github repos

5. Change the maven build life cycle command if necessary inside main.js

6. Supply needed environment variables (API_KEY and EMAIL)<br>

&nbsp;&nbsp;&nbsp;&nbsp;- You may setup your own github workflow env variables

&nbsp;&nbsp;&nbsp;&nbsp;- An example workflow I made for this builds repo: [build.yml](https://github.com/FN-FAL113/MavenBuilds/blob/main/.github/workflows/build.yml)

7. Run ```npm start```
