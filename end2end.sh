#!/bin/bash
#
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
#

jq --version > /dev/null 2>&1
if [ $? -ne 0 ]; then
	echo "Please Install 'jq' https://stedolan.github.io/jq/ to execute this script"
	echo
	exit 1
fi

starttime=$(date +%s)

# Print the usage message
function printHelp () {
  echo "Usage: "
  echo "  ./testAPIs.sh -l golang|node"
  echo "    -l <language> - chaincode language (defaults to \"golang\")"
}
# Language defaults to "golang"
LANGUAGE="golang"
CHANNEL="testchannel"
# Parse commandline args
while getopts "h?l:c:" opt; do
  case "$opt" in
    h|\?)
      printHelp
      exit 0
    ;;
    l)  LANGUAGE=$OPTARG
    ;;
    c)  CHANNEL=$OPTARG
    ;;
  esac
done

## Update the channel name in the connection profile
function changeChannelName(){
  cd artifacts
  cp network-config-template.json network-config.json
  ARCH=`uname -s | grep Darwin`
    if [ "$ARCH" == "Darwin" ]; then
      OPTS="-it"
    else
      OPTS="-i"
    fi
  sed $OPTS "s/CHANNEL_NAME/${CHANNEL}/g" network-config.json
  rm -rf network-config.jsont
  cd -
}

changeChannelName

##set chaincode path
function setChaincodePath(){
	LANGUAGE=`echo "$LANGUAGE" | tr '[:upper:]' '[:lower:]'`
	case "$LANGUAGE" in
		"golang")
		# CC_SRC_PATH="github.com/example_cc/go"
		CC_SRC_PATH="github.com/marbles/go"
		;;
		"node")
		CC_SRC_PATH="$PWD/artifacts/src/github.com/example_cc/node"
		;;
		*) printf "\n ------ Language $LANGUAGE is not supported yet ------\n"$
		exit 1
	esac
}

setChaincodePath

echo "POST request Enroll on Org1  ..."
echo
ORG1_TOKEN=$(curl -s -X POST \
  http://localhost:4000/users \
  -H "content-type: application/x-www-form-urlencoded" \
  -d 'username=Jim&orgName=Org1')
echo $ORG1_TOKEN
ORG1_TOKEN=$(echo $ORG1_TOKEN | jq ".token" | sed "s/\"//g")
echo
echo "ORG1 token is $ORG1_TOKEN"

echo
echo "POST request Enroll on Org2 ..."
echo
ORG2_TOKEN=$(curl -s -X POST \
  http://localhost:4000/users \
  -H "content-type: application/x-www-form-urlencoded" \
  -d 'username=Barry&orgName=Org2')
echo $ORG2_TOKEN
ORG2_TOKEN=$(echo $ORG2_TOKEN | jq ".token" | sed "s/\"//g")
echo
echo "ORG2 token is $ORG2_TOKEN"
echo

echo
echo "POST request Create channel  ..."
echo
curl -s -X POST \
  http://localhost:4000/channels \
  -H "authorization: Bearer $ORG1_TOKEN" \
  -H "content-type: application/json" \
  -d "{
	\"channelName\":\"${CHANNEL}\",
	\"consortium\":\"SampleConsortium\",
	\"mspIds\":[\"Org1MSP\",\"Org2MSP\"]
}"

echo
echo
sleep 5
echo "POST request Join channel on Org1"
echo
curl -s -X POST \
  "http://localhost:4000/channels/${CHANNEL}/peers" \
  -H "authorization: Bearer $ORG1_TOKEN" \
  -H "content-type: application/json" \
  -d '{
	"peers": ["peer0.org1.example.com","peer1.org1.example.com"]
}'
echo
echo

echo "POST request Join channel on Org2"
echo
curl -s -X POST \
  "http://localhost:4000/channels/${CHANNEL}/peers" \
  -H "authorization: Bearer $ORG2_TOKEN" \
  -H "content-type: application/json" \
  -d '{
	"peers": ["peer0.org2.example.com","peer1.org2.example.com"]
}'
echo
echo

# Update Anchor peer on the channel
echo
echo "POST request update Anchor peer on the channel  ..."
echo
curl -s -X POST \
  "http://localhost:4000/channels/${CHANNEL}/anchorupdate" \
  -H "authorization: Bearer $ORG1_TOKEN" \
  -H "content-type: application/json" \
  -d '{
  "host":"peer0.org1.example.com",
  "port": 7051
}'
echo
echo

echo
echo "POST request Anchor peer on the channel  ..."
echo
curl -s -X POST \
  "http://localhost:4000/channels/${CHANNEL}/anchorupdate" \
  -H "authorization: Bearer $ORG2_TOKEN" \
  -H "content-type: application/json" \
  -d '{
  "host":"peer0.org2.example.com",
  "port": 7051
}'
echo
echo


function registerAndRevokeUser() {
  echo
  echo "POST request Enroll ratnakar on Org1 ..."
  echo
  TEMP_TOKEN=$(curl -s -X POST \
    http://localhost:4000/users \
    -H "content-type: application/x-www-form-urlencoded" \
    -d 'username=ratnakar&orgName=Org1')
  echo $TEMP_TOKEN
  TEMP_TOKEN=$(echo $TEMP_TOKEN | jq ".token" | sed "s/\"//g")
  echo
  echo "TEMP token is $TEMP_TOKEN"
  echo
  ###### REVOKE USER ######
  echo
  echo "POST request revokeUser ratnakar on Org1  ..."
  echo
  CRL=$(curl -s -X POST \
    http://localhost:4000/revokeUser \
    -H "authorization: Bearer $TEMP_TOKEN" \
    -H "content-type: application/x-www-form-urlencoded")
  echo ""
  printf "\nCRL of user ratnakar is: ${CRL}\n"
  ###### REVOKE USER ######

  echo "curl -s -X POST http://localhost:4000/channels/${CHANNEL}/update -H \"authorization: Bearer $TEMP_TOKEN\" -H \"content-type: application/json\" -d \"{ \\\"crl\\\":\\\"${CRL}\\\"}\""
  echo 
  echo 
  curl -s -X POST \
    "http://localhost:4000/channels/${CHANNEL}/update" \
    -H "authorization: Bearer $TEMP_TOKEN" \
    -H "content-type: application/json" \
    -d "{
    \"crl\":\"${CRL}\"
  }"
  echo 
  echo 
  echo "Query chaincode with revoked user ratnakar"
  echo 
  curl -s -X GET \
    "http://localhost:4000/channels/${CHANNEL}/chaincodes/mycc?peer=peer0.org1.example.com&fcn=readMarble&args=%5B%22marble1%22%5D" \
    -H "authorization: Bearer $TEMP_TOKEN" \
    -H "content-type: application/json"
  echo
  echo
}

function installInstantiateUpgradeChaincode(){
  echo "POST Install chaincode on Org1"
  echo
  curl -s -X POST \
    http://localhost:4000/chaincodes \
    -H "authorization: Bearer $ORG1_TOKEN" \
    -H "content-type: application/json" \
    -d "{
    \"peers\": [\"peer0.org1.example.com\",\"peer1.org1.example.com\"],
    \"chaincodeName\":\"mycc\",
    \"chaincodePath\":\"$CC_SRC_PATH\",
    \"chaincodeType\": \"$LANGUAGE\",
    \"chaincodeVersion\":\"v$1\"
  }"
  echo
  echo

  echo "POST Install chaincode on Org2"
  echo
  curl -s -X POST \
    http://localhost:4000/chaincodes \
    -H "authorization: Bearer $ORG2_TOKEN" \
    -H "content-type: application/json" \
    -d "{
    \"peers\": [\"peer0.org2.example.com\",\"peer1.org2.example.com\"],
    \"chaincodeName\":\"mycc\",
    \"chaincodePath\":\"$CC_SRC_PATH\",
    \"chaincodeType\": \"$LANGUAGE\",
    \"chaincodeVersion\":\"v$1\"
  }"
  echo
  echo
  echo "POST instantiate/upgrade chaincode on peer1 of Org1"
  echo
  curl -s -X POST \
    "http://localhost:4000/channels/${CHANNEL}/chaincodes" \
    -H "authorization: Bearer $ORG1_TOKEN" \
    -H "content-type: application/json" \
    -d "{
    \"peers\": [\"peer0.org1.example.com\"],
    \"chaincodeName\":\"mycc\",
    \"chaincodeVersion\":\"v$1\",
    \"chaincodeType\": \"$LANGUAGE\",
    \"isUpgrade\": $2,
    \"args\":[\"\"]
  }"
  echo
  echo
}

function invokeAndQuery() {
  echo "POST invoke chaincode on peers of Org1 and Org2"
  echo
    # "peers": ["peer0.org1.example.com","peer0.org2.example.com"],
INIT_MARBLE=$(cat <<EOF
{
    "peers": ["peer0.org1.example.com","peer0.org2.example.com"],
    "fcn":"initMarble",
    "args":["marble$1", "blue", "35", "tom"]
}
EOF
)

  TRX_ID=$(curl -s -X POST \
    "http://localhost:4000/channels/${CHANNEL}/chaincodes/mycc" \
    -H "authorization: Bearer $ORG1_TOKEN" \
    -H "content-type: application/json" \
    -d "${INIT_MARBLE}")
  echo "Transaction ID is $TRX_ID"
  echo
  echo

#### Query the marbles
for ((i=1;i<=2;i++))
do

  echo "GET query chaincode on peer1 of Org${i}, readMarble"
  echo
  curl -s -X GET \
    "http://localhost:4000/channels/${CHANNEL}/chaincodes/mycc?peer=peer0.org${i}.example.com&fcn=readMarble&args=%5B%22marble${1}%22%5D" \
    -H "authorization: Bearer $ORG1_TOKEN" \
    -H "content-type: application/json"
  echo
  echo

  echo "GET query chaincode on peer1 of Org${i}, readMarblePrivateDetails"
  echo
  curl -s -X GET \
    "http://localhost:4000/channels/${CHANNEL}/chaincodes/mycc?peer=peer0.org${i}.example.com&fcn=readMarblePrivateDetails&args=%5B%22marble${1}%22%5D" \
    -H "authorization: Bearer $ORG1_TOKEN" \
    -H "content-type: application/json"
  echo
  echo

  echo "GET query chaincode on peer1 of Org${i}, readMarble"
  echo
  curl -s -X GET \
    "http://localhost:4000/channels/${CHANNEL}/chaincodes/mycc?peer=peer0.org${i}.example.com&fcn=readMarble&args=%5B%22marble${1}%22%5D" \
    -H "authorization: Bearer $ORG1_TOKEN" \
    -H "content-type: application/json"
  echo
  echo
  done
}

function richQuery(){
  echo "richQuery chaincode on peer1 of Org1, queryMarblesByOwner 'tom'"
  echo
  curl -s -X GET \
    "http://localhost:4000/channels/${CHANNEL}/chaincodes/mycc?peer=peer0.org1.example.com&fcn=queryMarblesByOwner&args=%5B%22tom%22%5D" \
    -H "authorization: Bearer $ORG1_TOKEN" \
    -H "content-type: application/json"
  echo
  echo
}

function rangeQuery(){
  echo "rangeQuery chaincode on peer1 of Org1, getMarblesByRange"
  echo
  curl -s -X GET \
    "http://localhost:4000/channels/${CHANNEL}/chaincodes/mycc?peer=peer0.org1.example.com&fcn=getMarblesByRange&args=%5B%22marble1%22,%22marble3%22%5D" \
    -H "authorization: Bearer $ORG1_TOKEN" \
    -H "content-type: application/json"
  echo
  echo
}
# Install & Instantiate the cc with version "v0". FALSE here indicates that this is CC Instantiate
installInstantiateUpgradeChaincode 0 false
sleep 1
invokeAndQuery 1

# exit
### regsiter a new user ratnakar, revoke and update the channel
registerAndRevokeUser

# Install & Upgrade the cc with version "v1". TRUE here indicates that this is CC Upgrade
installInstantiateUpgradeChaincode 1 true
sleep 1
invokeAndQuery 2
richQuery
rangeQuery

echo "GET query Block by blockNumber"
echo
curl -s -X GET \
  "http://localhost:4000/channels/${CHANNEL}/blocks/4?peer=peer0.org1.example.com" \
  -H "authorization: Bearer $ORG1_TOKEN" \
  -H "content-type: application/json"
echo
echo

echo "GET query Transaction by TransactionID"
echo
curl -s -X GET "http://localhost:4000/channels/${CHANNEL}/transactions/$TRX_ID?peer=peer0.org1.example.com" \
  -H "authorization: Bearer $ORG1_TOKEN" \
  -H "content-type: application/json"
echo
echo

echo "GET query ChainInfo"
echo
curl -s -X GET \
  "http://localhost:4000/channels/${CHANNEL}?peer=peer0.org1.example.com" \
  -H "authorization: Bearer $ORG1_TOKEN" \
  -H "content-type: application/json"
echo
echo

echo "GET query Installed chaincodes"
echo
curl -s -X GET \
  "http://localhost:4000/chaincodes?peer=peer0.org1.example.com" \
  -H "authorization: Bearer $ORG1_TOKEN" \
  -H "content-type: application/json"
echo
echo

echo "GET query Instantiated chaincodes"
echo
curl -s -X GET \
  "http://localhost:4000/channels/${CHANNEL}/chaincodes?peer=peer0.org1.example.com" \
  -H "authorization: Bearer $ORG1_TOKEN" \
  -H "content-type: application/json"
echo
echo

echo "GET query Channels"
echo
curl -s -X GET \
  "http://localhost:4000/channels?peer=peer0.org1.example.com" \
  -H "authorization: Bearer $ORG1_TOKEN" \
  -H "content-type: application/json"
echo
echo

echo "Total execution time : $(($(date +%s)-starttime)) secs ..."
