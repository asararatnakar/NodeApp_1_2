// Copyright Ratnakar All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

var util = require('util');
var fs = require('fs');
var path = require('path');
const agent = require('superagent-promise')(require('superagent'), Promise);
// var superagent = require('superagent');
var helper = require('./helper.js');
var logger = helper.getLogger('Create-Channel');
//Attempt to send a request to the orderer with the sendTransaction method
var configUpdate = async function(channelName, username, orgName, body) {
	logger.debug('\n====== Creating Channel \'' + channelName + '\' ======\n');
	try {
		// first setup the client for this org
		var client = await helper.getClientForOrg(orgName);
		logger.debug('Successfully got the fabric client for the organization "%s"', orgName);

		// enable Client TLS
		var tlsInfo =  await helper.tlsEnroll(client);
		client.setTlsClientCertAndKey(tlsInfo.certificate, tlsInfo.key);

        let envelope = fs.readFileSync(path.join(__dirname, '../artifacts/channel/'+client.getMspid()+'anchors.tx'));
        var channelConfig = client.extractChannelConfig(envelope);
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
			logger.debug('Successfully created the channel.');
			let response = {
				success: true,
				message: 'Channel \'' + channelName + '\' updated with Anchor peer Successfully'
			};
			return response;
		} else {
			logger.error('\n!!!!!!!!! Failed to update the channel \'' + channelName +
				'\' with Anchor peer !!!!!!!!!\n\n');
			throw new Error('Failed to update the channel \'' + channelName + '\' with Anchor peer');
		}
	} catch (err) {
		logger.error('Failed to initialize the channel: ' + err.stack ? err.stack :	err);
		throw new Error('Failed to initialize the channel: ' + err.toString());
	}
};

exports.configUpdate = configUpdate;