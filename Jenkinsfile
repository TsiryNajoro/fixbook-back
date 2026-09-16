pipeline {
    agent any

    stages {

        stage('Test Gitleaks History') {
            steps {
                sh '''
                echo "Workspace Jenkins : $WORKSPACE"

                docker run --rm \
                  -v jenkins_home:/var/jenkins_home \
                  zricethezav/gitleaks:latest \
                  git "$WORKSPACE" \
                  --report-format=json \
                  --report-path="$WORKSPACE/gitleaks-history.json" \
                  --no-banner
                '''
            }
        }

    }
}