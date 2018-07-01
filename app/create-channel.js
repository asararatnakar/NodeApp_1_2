/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
var util = require('util');
var fs = require('fs');
var path = require('path');
const agent = require('superagent-promise')(require('superagent'), Promise);

var helper = require('./helper.js');
var logger = helper.getLogger('Create-Channel');
//Attempt to send a request to the orderer with the sendTransaction method
var createChannel = async function(channelName, username, orgName) {
	logger.debug('\n====== Creating Channel \'' + channelName + '\' ======\n');
	try {
		// first setup the client for this org
		var client = await helper.getClientForOrg(orgName);
		logger.debug('Successfully got the fabric client for the organization "%s"', orgName);

		// enable Client TLS
		var tlsInfo =  await helper.tlsEnroll(client);
		client.setTlsClientCertAndKey(tlsInfo.certificate, tlsInfo.key);

		//TODO: needs to include the following and Cleanup
		// 1. don't hardcode the URLs and PATHs
		// 2. Read MSPIDS dynamically
		// &  modularize this to make it for channel configurations
		const channelCfg = fs.readFileSync(path.join(__dirname, '../artifacts/channel/channel_template.json'));
		const configJson = JSON.parse(channelCfg.toString());
		configJson.channel_id = channelName;

		const config = await agent.post('http://127.0.0.1:7059/protolator/encode/common.ConfigUpdate', JSON.stringify(configJson))
		.buffer();
		let channelConfig = config.body;

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
		var response = await client.createChannel(request)
		logger.debug(' response ::%j', response);
		if (response && response.status === 'SUCCESS') {
			logger.debug('Successfully created the channel.');
			let response = {
				success: true,
				message: 'Channel \'' + channelName + '\' created Successfully'
			};
			return response;
		} else {
			logger.error('\n!!!!!!!!! Failed to create the channel \'' + channelName +
				'\' !!!!!!!!!\n\n');
			throw new Error('Failed to create the channel \'' + channelName + '\'');
		}
	} catch (err) {
		logger.error('Failed to initialize the channel: ' + err.stack ? err.stack :	err);
		throw new Error('Failed to initialize the channel: ' + err.toString());
	}
};

exports.createChannel = createChannel;