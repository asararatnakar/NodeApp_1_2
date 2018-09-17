// Copyright Ratnakar All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

var util = require('util');
var fs = require('fs');
var path = require('path');
const agent = require('superagent-promise')(require('superagent'), Promise);
// var superagent = require('superagent');
var helper = require('./helper.js');
var logger = helper.getLogger('Update-AnchorPeer');
//Attempt to send a request to the orderer with the sendTransaction method
var anchorPeerUpdate = async function (channelName, username, orgName, body) {
	logger.debug('\n====== Updating Anchor Peer on the Channel \'' + channelName + '\' ======\n');
	try {
		// first setup the client for this org
		var client = await helper.getClientForOrg(orgName);
		logger.debug('Successfully got the fabric client for the organization "%s"', orgName);

		// enable Client TLS
		// var tlsInfo = await helper.tlsEnroll(client);
		// client.setTlsClientCertAndKey(tlsInfo.certificate, tlsInfo.key);
		//TODO: Check what type of config update ?
		//TODO: needs to include the following + Cleanup
		// 1. don't hardcode the URLs and PATHs
		// 2. Read MSPIDS dynamically
		// &  modularize this to make it for channel configurations
		const channelCfg = fs.readFileSync(path.join(__dirname, '../artifacts/channel/anchor_template.json'));
		const configJson = JSON.parse(channelCfg.toString());
		configJson.channel_id = channelName;

		let mspPlaceHolder = {
			"policies": {
				"Admins": {},
				"Readers": {},
				"Writers": {}
			},
			"values": {
				"MSP": {}
			}
		};
		let anchorPlaceHolder = {
			"mod_policy": "Admins",
			"values": {
				"AnchorPeers": {
					"mod_policy": "Admins",
					"value": {
						"anchor_peers": [
							{
								"host": "peer",
								"port": 7051
							}
						]
					},
					"version": "0"
				},
				"MSP": {}
			},
			"version": "1"
		};
		configJson.read_set.groups.Application.groups[client.getMspid()] = mspPlaceHolder;
		anchorPlaceHolder.policies = mspPlaceHolder.policies;
		anchorPlaceHolder.values.AnchorPeers.value.anchor_peers[0].host = body.host;
		anchorPlaceHolder.values.AnchorPeers.value.anchor_peers[0].port = body.port;
		configJson.write_set.groups.Application.groups[client.getMspid()] = anchorPlaceHolder;
		const config = await agent.post('http://127.0.0.1:7059/protolator/encode/common.ConfigUpdate', JSON.stringify(configJson)).buffer();
		let channelConfig = config.body;
		// console.log(channelConfig.toString());

		//Acting as a client in the given organization provided with "orgName" param
		// sign the channel config bytes as "endorsement", this is required by
		// the orderer's channel creation policy
		// this will use the admin identity assigned to the client when the connection profile was loaded
		let signature = client.signChannelConfig(channelConfig);

		let request = {
			config: channelConfig,
			signatures: [signature],
			name: channelName,
			txId: client.newTransactionID(true) // get an admin based transactionID
		};

		// send to orderer
		var response = await client.updateChannel(request)
		logger.debug(' response ::%j', response);
		if (response && response.status === 'SUCCESS') {
			logger.debug('Successfully update the channel with Anchor peer.');
			let response = {
				success: true,
				message: 'Channel \'' + channelName + '\' updated with Anchor peer Successfully'
			};
			return response;
		} else {
			logger.error('\n!!!!!!!!! Failed to update the Anchor peer on channel \'' + channelName +
				'\' with Anchor peer !!!!!!!!!\n\n');
			throw new Error('Failed to update the Anchor peer on channel \'' + channelName + '\' with Anchor peer');
		}
	} catch (err) {
		logger.error('Failed to initialize the channel: ' + err.stack ? err.stack : err);
		throw new Error('Failed to initialize the channel: ' + err.toString());
	}
};

exports.anchorPeerUpdate = anchorPeerUpdate;
