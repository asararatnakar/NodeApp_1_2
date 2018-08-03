#!/bin/bash
#
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
#

function stopContainers(){
	# Stop chaincode containers and images as well
	docker rm -f $(docker ps -aq --filter name=dev-peer) > /dev/null 2>&1
	docker rmi $(docker images | awk '$1 ~ /dev-peer/ { print $3 }') > /dev/null 2>&1
}

function restartNetwork() {
	echo
        #teardown the network and clean the containers and intermediate images
	docker-compose -f ./artifacts/docker-compose.yaml -f ./artifacts/docker-compose-couch.yaml down
	#Cleanup the stores
	rm -rf ./fabric-client-kv-org*

	#Start the network
	docker-compose -f ./artifacts/docker-compose.yaml -f ./artifacts/docker-compose-couch.yaml up -d
	echo
}

function npmInstall() {
	echo
	if [ -d node_modules ]; then
	        value=$(npm info fabric-client version)
		if [ "$value" = "1.2.1" ]; then
			echo "============== node modules installed already ============="
		else
    			npm install
		fi
	else
		echo "============== Installing node modules ============="
		npm install
	fi
	echo
}

function downloaFabricImages(){
	FABRIC_TAG=1.2.0
	FABRIC_IMAGES=$(docker images | grep 1.2.0 | wc -l)
	if [ "$FABRIC_IMAGES" != "5" ]; then
		echo "============== Downloading Fabric Images =============="
		for image in peer orderer ca ccenv tools; do
            docker pull hyperledger/fabric-$image:$FABRIC_TAG
            docker tag hyperledger/fabric-$image:$FABRIC_TAG hyperledger/fabric-$image
        done
	fi
}

# Download v1.2 docker images
downloaFabricImages

#Restart the network each time you start application
restartNetwork

#Install 1.2.x node modules
npmInstall

# start the node app on port 4000
PORT=4000 node app
