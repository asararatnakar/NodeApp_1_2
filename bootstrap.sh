#!/bin/bash
#
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
#
. .env
TIMEOUT=45
function stopContainers(){
	# Stop chaincode containers and images as well
	docker rm -f $(docker ps -aq --filter name=dev-peer) > /dev/null 2>&1
	docker rmi $(docker images | awk '$1 ~ /dev-peer/ { print $3 }') > /dev/null 2>&1
}

function restartNetwork() {
	echo
    #teardown the network and clean the containers and intermediate images
	docker-compose -f ./artifacts/docker-compose.yaml -f ./artifacts/docker-compose-couch.yaml down

	stopContainers

	#Cleanup the stores
	rm -rf ./fabric-client-kv-org* ./artifacts/network-config-org[1-2].json

	#Start the network
	docker-compose -f ./artifacts/docker-compose.yaml -f ./artifacts/docker-compose-couch.yaml up -d
	echo
}

function npmInstall() {
	echo
	if [ -d node_modules ]; then
	    value=$(npm list | awk -F@ '/fabric-client/ { print $2}')
            if [ "$value" = "1.4.0-rc2" ]; then
                echo "============== node modules installed already ============="
            else
                echo "current fabric-client version is ${value}, changing it to 1.4.0-rc2"
                npm install
            fi
        else
            echo "============== Installing node modules ============="
            npm install
        fi
	echo
}

function downloaFabricImages(){
    FAB_TAG=$(echo ${DOCKER_IMG_TAG} | tr ':' '\n' | tail -1)
	IMAGES_CTR=$(docker images | grep ${FAB_TAG} | wc -l)
	IMAGE_ARRAY=(peer orderer ca ccenv tools)
	# array=(one two three four [5]=five)
	if [ $IMAGES_CTR -lt ${#IMAGE_ARRAY[*]} ]; then
		echo "============== Downloading Fabric Images =============="
		for image in ${IMAGE_ARRAY[*]}
		do
            docker pull hyperledger/fabric-$image$DOCKER_IMG_TAG
            docker tag hyperledger/fabric-$image$DOCKER_IMG_TAG hyperledger/fabric-$image
        done
	fi
    TAG=$(echo ${THIRDPARTY_IMG_TAG} | tr ':' '\n' | tail -1)
	IMAGES_CTR=$(docker images | grep "kafka\|zookeeper\|couchdb" | grep ${TAG} | wc -l)
	IMAGE_ARRAY=(couchdb kafka zookeeper)
	if [ $IMAGES_CTR -lt ${#IMAGE_ARRAY[*]} ]; then
		echo "============== Downloading Thirdparty Images =============="
		for image in ${IMAGE_ARRAY[*]}
		do
            docker pull hyperledger/fabric-$image$THIRDPARTY_IMG_TAG
            docker tag hyperledger/fabric-$image$THIRDPARTY_IMG_TAG hyperledger/fabric-$image
        done
	fi
}

function checkOrdereingService(){
		printf "\n ========== Checking for Ordereing Service availability ======\n"
        local rc=1
        docker logs orderer0.example.com 2>&1 | grep -q "Start phase completed successfully"
        rc=$?
        local starttime=$(date +%s)
        while test "$(($(date +%s)-starttime))" -lt "$TIMEOUT" -a $rc -ne 0
        do
                docker logs orderer0.example.com 2>&1 | grep -q "Start phase completed successfully"
                rc=$?
        done
		printf "\n ========== Ordereing Service is UP and Running ======\n"
}

# Download v1.4 docker images
downloaFabricImages

#Restart the network each time you start application
restartNetwork

#Install 1.4.x node modules
npmInstall

# Check if ordereing service (OSN) is available yet
checkOrdereingService

ARCH=`uname -s | grep Darwin`
if [ "$ARCH" == "Darwin" ]; then
  OPTS="-it"
else
  OPTS="-i"
fi

## Update the channel name in the connection profile
function generateConnectionProfiles(){
  for org_name in Org1 Org2
  do
    lower_org_name=$(echo "$org_name" | awk '{print tolower($0)}')
    cp ./artifacts/network-config-template.json ./artifacts/network-config-${lower_org_name}.json
    # sed $OPTS "s|CHANNEL_NAME|${CHANNEL}|g" network-config-${lower_org_name}.json
    sed $OPTS "s|ORG_NAME|${org_name}|g" ./artifacts/network-config-${lower_org_name}.json
    sed $OPTS "s|KEYSTORE_ORG|./fabric-client-kv-${lower_org_name}|g" ./artifacts/network-config-${lower_org_name}.json
    rm -rf ./artifacts/network-config-${lower_org_name}.jsont
  done
}

generateConnectionProfiles
# start the node app on port 4000
printf "\n\n ############# Starting App on Port 4000 #############\n"
PORT=4000 node app
