// Copyright Ratnakar All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

var util = require('util');
var fs = require('fs');
var path = require('path');
const agent = require('superagent-promise')(require('superagent'), Promise);
// var superagent = require('superagent');
var helper = require('./helper.js');
var logger = helper.getLogger('Update-Channel');
const requester = require('request');
//Attempt to send a request to the orderer with the sendTransaction method


var configUpdate = async function (channelName, username, orgName, crl) {
	logger.debug('\n====== Updating Channel \'' + channelName + '\' ======\n');
	try {
		// first setup the client for this org
		var client = await helper.getClientForOrg(orgName);
		logger.debug('Successfully got the fabric client for the organization "%s"', orgName);

		// enable Client TLS
		var tlsInfo = await helper.tlsEnroll(client);
		client.setTlsClientCertAndKey(tlsInfo.certificate, tlsInfo.key);
		var channel = client.getChannel(channelName);
		var configEnvelope = await channel.getChannelConfig();//await channel.getChannelConfigFromOrderer();
		const origConfigProto = configEnvelope.config.toBuffer();
		const configJson = await agent.post('http://127.0.0.1:7059/protolator/decode/common.Config', origConfigProto).buffer();
		var mspId = client.getMspid();
		// var updatedConfigJson = JSON.parse(configJson.text.toString());
		var origConfigJson = configJson.text.toString();
		var updatedConfigJson = JSON.parse(origConfigJson);
		// console.log(updatedConfigJson);
		updatedConfigJson.channel_group.groups.Application.groups[mspId].values.MSP.value.config.revocation_list = [crl];
		// console.log(updatedConfigJson.channel_group.groups.Application.groups[mspId].values.MSP.value.config.revocation_list)

		const updatedConfigPb = await agent.post('http://127.0.0.1:7059/protolator/encode/common.Config', JSON.stringify(updatedConfigJson)).buffer();
		const formData = {
			channel: channelName,
			original: {
				value: origConfigProto,
				options: {
					filename: 'original.proto',
					contentType: 'application/octet-stream'
				}
			},
			updated: {
				value: updatedConfigPb.body,
				options: {
					filename: 'updated.proto',
					contentType: 'application/octet-stream'
				}
			}
		};
		var configProto = await new Promise((resolve, reject) => {
			requester.post({
				url: 'http://127.0.0.1:7059/configtxlator/compute/update-from-configs',
				encoding: null,
				headers: {
					accept: '/',
					expect: '100-continue'
				},
				formData: formData
			}, (err, res, body) => {
				if (err) {
					logger.error('Failed to get the updated configuration ::' + err);
					reject(err);
				} else {
					const proto = Buffer.from(body, 'binary');
					resolve(proto);
				}
			});
		});
		logger.debug('Successfully had configtxlator compute the updated config object');

		//Acting as a client in the given organization provided with "orgName" param
		// sign the channel config bytes as "endorsement", this is required by
		// the orderer's channel creation policy
		// this will use the admin identity assigned to the client when the connection profile was loaded
		let signatures = [];
		client.newTransactionID(true);
		// sign and collect signature from org1
		let signature = client.signChannelConfig(configProto);
		signatures.push(signature);
		
		let request = {
			config: configProto,
			signatures: [signature],
			name: channelName,
			txId: client.newTransactionID(true) // get an admin based transactionID
		};

		// send to orderer
		var response = await client.updateChannel(request)
		logger.debug(' response ::%j', response);
		if (response && response.status === 'SUCCESS') {
			logger.debug('Successfully updated the channel.');
			let response = {
				success: true,
				message: 'Channel \'' + channelName + '\' updated with revoked user CRL Successfully'
			};
			return response;
		} else {
			logger.error('\n!!!!!!!!! Failed to update the channel \'' + channelName +
				'\' with user revocation !!!!!!!!!\n\n');
			throw new Error('Failed to update the channel \'' + channelName + '\' with user revocation');
		}
	} catch (err) {
		logger.error('Failed to initialize the channel: ' + err.stack ? err.stack : err);
		throw new Error('Failed to initialize the channel: ' + err.toString());
	}
};

exports.configUpdate = configUpdate;