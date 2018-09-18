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
'use strict';
const log4js = require('log4js');
const logger = log4js.getLogger('Helper');
logger.setLevel('DEBUG');

const path = require('path');
const util = require('util');
const hfc = require('fabric-client');
hfc.setLogger(logger);
const fs = require('fs');
const configStr = '-connection-profile';

function orgsList(config) {
	let orgs = [];
	for (let key in config.organizations) {
		orgs.push(key)
	}
	return orgs;
}
function getChannelSection(config) {
	let peers = {};
	for (let key in config.organizations) {
		let orgPeers = config.organizations[key].peers;
		for (let peer in orgPeers) {
			let val = orgPeers[peer]
			peers[val] = {};
		}
	}
	let orderers = [];
	for (let key in config.orderers) {
		orderers.push(key);
	}
	let channel = {};
	channel.peers = peers;
	channel.orderers = orderers;
	// console.log(JSON.stringify(main));
	// return JSON.stringify(main);
	return channel;
}
function isChannelExists(channel, config) {
	for (let key in config.channels) {
		if (key == channel) {
			return true;
		}
	}
	return false;
}
async function updateCCP(channel, orgname) {
	logger.debug('updateCCP - ****** update connection profile with channel name : ', channel);
	var config = require('../artifacts/network-config-'+orgname+'.json');
	let orgs = orgsList(config);
	if (isChannelExists(channel, config)) {
		//No need to update the connection profile if it already updated with channel section
		return { 'message': 'channel ' + channel + ' already exists in the connection profile' };
	}
	// build a client context and load it with a connection profile
	// lets load the network settings and a client section. This will also set an admin
	// identity because the organization defined in the client section has one defined.
	for (let key in orgs) {
		//TODO: Hardcoding in several places looks ugly ?
		config = require(path.join(__dirname, '../artifacts', 'network-config-' + orgs[key] + '.json'));
		config.channels[channel] = getChannelSection(config);
		// console.log(JSON.stringify(config, null, 4));
		fs.writeFileSync(path.join(__dirname, '../artifacts', 'network-config-' + orgs[key] + '.json'), JSON.stringify(config, null, 4), 'utf-8');
		hfc.setConfigSetting(orgs[key] + configStr, path.join(__dirname, '../artifacts', 'network-config-' + orgs[key].toLowerCase() + '.json'));
	}
	return { 'message': 'Connection profiles are updated successfully with channel ' + channel };

}
async function getClientForOrg(userorg, username) {
	logger.debug('getClientForOrg - ****** START %s %s', userorg, username)
	// get a fabric client loaded with a connection profile for this org
	// build a client context and load it with a connection profile
	// lets load the network settings and a client section. This will also set an admin 
	// identity because the organization defined in the client section has one defined.
	let client = hfc.loadFromConfig(hfc.getConfigSetting(userorg + configStr));

	// This will load a connection profile over the top of the current one one
	// since the first one did not have a client section and the following one does
	// nothing will actually be replaced.
	// This will also set an admin identity because the organization defined in the
	// client section has one defined
	// client.loadFromConfig(hfc.getConfigSetting(userorg+config));

	// this will create both the state store and the crypto store based
	// on the settings in the client section of the connection profile
	await client.initCredentialStores();

	// The getUserContext call tries to get the user from persistence.
	// If the user has been saved to persistence then that means the user has
	// been registered and enrolled. If the user is found in persistence
	// the call will then assign the user to the client object.
	if (username) {
		let user = await client.getUserContext(username, true);
		if (!user) {
			throw new Error(util.format('User was not found :', username));
		} else {
			logger.debug('User %s was found to be registered and enrolled', username);
		}
	}
	logger.debug('getClientForOrg - ****** END %s %s \n\n', userorg, username)

	return client;
}

var getRegisteredUser = async function (username, userOrg, isJson) {
	try {
		var client = await getClientForOrg(userOrg);
		logger.debug('Successfully initialized the credential stores');
		// client can now act as an agent for organization Org1
		// first check to see if the user is already enrolled
		var user = await client.getUserContext(username, true);
		if (user && user.isEnrolled()) {
			logger.info('Successfully loaded member from persistence');
		} else {
			let caClient = client.getCertificateAuthority();
			var admins = caClient.getRegistrar();
			// user was not enrolled, so we will need an admin user object to register
			logger.info('User %s was not enrolled, so we will need an admin user object to register', username);
			let adminUserObj = await client.setUserContext({ username: admins[0].enrollId, password: admins[0].enrollSecret });
			let secret = await caClient.register({
				enrollmentID: username,
				affiliation: 'org1.department1' //TODO: change this as per the network type?
			}, adminUserObj);
			logger.debug('Successfully got the secret for user %s', username);
			user = await client.setUserContext({ username: username, password: secret });
			logger.debug('Successfully enrolled username %s  and setUserContext on the client object', username);
		}
		if (user && user.isEnrolled) {
			if (isJson && isJson === true) {
				var response = {
					success: true,
					secret: user._enrollmentSecret,
					message: username + ' enrolled Successfully',
				};
				return response;
			}
		} else {
			throw new Error('User was not enrolled ');
		}
	} catch (error) {
		logger.error('Failed to get registered user: %s with error: %s', username, error.toString());
		return 'failed ' + error.toString();
	}

};


var setupChaincodeDeploy = function () {
	process.env.GOPATH = path.join(__dirname, hfc.getConfigSetting('CC_SRC_PATH'));
};

var getLogger = function (moduleName) {
	var logger = log4js.getLogger(moduleName);
	logger.setLevel('DEBUG');
	return logger;
};

async function tlsEnroll(client) {
	let caClient = client.getCertificateAuthority();
	var admins = caClient.getRegistrar();
	let req = {
		enrollmentID: admins[0].enrollId,
		enrollmentSecret: admins[0].enrollSecret,
		profile: 'tls'
	};
	var enrollment = await caClient.enroll(req);
	enrollment.key = enrollment.key.toBytes();
	return enrollment;
}

async function revokeUser(username, userOrg) {
	try {
		var client = await getClientForOrg(userOrg);
		logger.debug('Successfully initialized the credential stores');
		// client can now act as an agent for organization Org1
		// first check to see if the user is enrolled or not
		var user = await client.getUserContext(username, true);
		if (user && user.isEnrolled()) {
			logger.info('Successfully loaded member from persistence');
			let caClient = client.getCertificateAuthority();
			var admins = caClient.getRegistrar();
			let adminUserObj = await client.setUserContext({ username: admins[0].enrollId, password: admins[0].enrollSecret });
			let crl = await caClient.revoke({ enrollmentID: username }, adminUserObj);
			console.log('-------------- C R L --------------');
			logger.debug(crl);
			console.log('-------------- C R L --------------');
			let genCrl = await caClient.generateCRL({}, adminUserObj);
			logger.debug(genCrl);
			return genCrl;
		} else {
			logger.error('Failed to get registered user: %s !!! First register the user : ' + username);
		}
	} catch (error) {
		logger.error('Failed to get registered user: %s with error: %s', username, error.toString());
		return 'failed ' + error.toString();
	}
}
var updatePassword = async function (username, secret, userOrg, isJson) {
	try {
		let client = await getClientForOrg(userOrg);
		let caClient = client.getCertificateAuthority();

		var admins = caClient.getRegistrar();
		let adminUser = await client.setUserContext({ username: admins[0].enrollId, password: admins[0].enrollSecret });

		try {
			let identityService = caClient.newIdentityService();
			identityService.update(username, {
				enrollmentSecret: secret
			}, adminUser);
		}
		catch (error) {
			logger.error('Failed to get update password for user: "%s" with error: "%s"', username, error.toString());
			throw new Error(error.toString());
		}

		if (isJson && isJson === true) {
			var response = {
				success: true,
				username: username,
				password: secret
			};
			return response;
		}
	} catch (error) {
		logger.error('Failed to update password for user: "%s" with error: "%s"', username, error.toString());
		throw new Error(error.toString());
	}
}
var getCreds = function(orgname){
	//TODO : validate if the org name exists in the current connetcion profile
	// console.log('------------------------------');
	let filePath = hfc.getConfigSetting(orgname + configStr);
	if (fs.existsSync(filePath)) {
		const credFile = fs.readFileSync(hfc.getConfigSetting(orgname + configStr) , 'utf-8');
		if (credFile) {
			// console.log(JSON.parse(credFile, null, 4));
			// console.log('------------------------------');
			return JSON.parse(credFile, null, 4);
		}
	}
	return 'Connection profile for org : '+orgname+' doesn\'t exists';
}
var updateCreds = function(orgname, creds){
	fs.writeFileSync(path.join(__dirname, '../artifacts', 'network-config-' + orgname.toLowerCase() + '.json'), JSON.stringify(creds, null, 4), 'utf-8');
	hfc.setConfigSetting(orgname + configStr, path.join(__dirname, '../artifacts', 'network-config-' + orgname.toLowerCase() + '.json'));

	return 'Connection profile for org : '+orgname+' Updated successfully !'
}
exports.getClientForOrg = getClientForOrg;
exports.getLogger = getLogger;
exports.setupChaincodeDeploy = setupChaincodeDeploy;
exports.getRegisteredUser = getRegisteredUser;
exports.tlsEnroll = tlsEnroll;
exports.revokeUser = revokeUser;
exports.updatePassword = updatePassword;
exports.updateCCP = updateCCP;
exports.getCreds = getCreds;
exports.updateCreds = updateCreds;