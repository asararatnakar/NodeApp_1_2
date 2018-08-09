/*
Copyright IBM Corp. All Rights Reserved.

SPDX-License-Identifier: Apache-2.0
*/

// ====CHAINCODE EXECUTION SAMPLES (CLI) ==================

// ==== Invoke marbles ====
// peer chaincode invoke -C mychannel -n marblesp -c '{"Args":["initMarble","marble1","blue","35","tom","99"]}'
// peer chaincode invoke -C mychannel -n marblesp -c '{"Args":["initMarble","marble2","red","50","tom","102"]}'
// peer chaincode invoke -C mychannel -n marblesp -c '{"Args":["initMarble","marble3","blue","70","tom","103"]}'
// peer chaincode invoke -C mychannel -n marblesp -c '{"Args":["transferMarble","marble2","jerry"]}'
// peer chaincode invoke -C mychannel -n marblesp -c '{"Args":["delete","marble1"]}'

// ==== Query marbles ====
// peer chaincode query -C mychannel -n marblesp -c '{"Args":["readMarble","marble1"]}'
// peer chaincode query -C mychannel -n marblesp -c '{"Args":["readMarblePrivateDetails","marble1"]}'
// peer chaincode query -C mychannel -n marblesp -c '{"Args":["getMarblesByRange","marble1","marble3"]}'

// Rich Query (Only supported if CouchDB is used as state database):
//   peer chaincode query -C mychannel -n marblesp -c '{"Args":["queryMarblesByOwner","tom"]}'
//   peer chaincode query -C mychannel -n marblesp -c '{"Args":["queryMarbles","{\"selector\":{\"owner\":\"tom\"}}"]}'

// INDEXES TO SUPPORT COUCHDB RICH QUERIES
//
// Indexes in CouchDB are required in order to make JSON queries efficient and are required for
// any JSON query with a sort. As of Hyperledger Fabric 1.1, indexes may be packaged alongside
// chaincode in a META-INF/statedb/couchdb/indexes directory. Or for indexes on private data
// collections, in a META-INF/statedb/couchdb/collections/<collection_name>/indexes directory.
// Each index must be defined in its own text file with extension *.json with the index
// definition formatted in JSON following the CouchDB index JSON syntax as documented at:
// http://docs.couchdb.org/en/2.1.1/api/database/find.html#db-index
//
// This marbles02_private example chaincode demonstrates a packaged index which you
// can find in META-INF/statedb/couchdb/collection/collectionMarbles/indexes/indexOwner.json.
// For deployment of chaincode to production environments, it is recommended
// to define any indexes alongside chaincode so that the chaincode and supporting indexes
// are deployed automatically as a unit, once the chaincode has been installed on a peer and
// instantiated on a channel. See Hyperledger Fabric documentation for more details.
//
// If you have access to the your peer's CouchDB state database in a development environment,
// you may want to iteratively test various indexes in support of your chaincode queries.  You
// can use the CouchDB Fauxton interface or a command line curl utility to create and update
// indexes. Then once you finalize an index, include the index definition alongside your
// chaincode in the META-INF/statedb/couchdb/indexes directory or
// META-INF/statedb/couchdb/collections/<collection_name>/indexes directory, for packaging
// and deployment to managed environments.
//
// In the examples below you can find index definitions that support marbles02_private
// chaincode queries, along with the syntax that you can use in development environments
// to create the indexes in the CouchDB Fauxton interface.
//

//Example hostname:port configurations to access CouchDB.
//
//To access CouchDB docker container from within another docker container or from vagrant environments:
// http://couchdb:5984/
//
//Inside couchdb docker container
// http://127.0.0.1:5984/

// Index for docType, owner.
// Note that docType and owner fields must be prefixed with the "data" wrapper
//
// Index definition for use with Fauxton interface
// {"index":{"fields":["data.docType","data.owner"]},"ddoc":"indexOwnerDoc", "name":"indexOwner","type":"json"}

// Index for docType, owner, size (descending order).
// Note that docType, owner and size fields must be prefixed with the "data" wrapper
//
// Index definition for use with Fauxton interface
// {"index":{"fields":[{"data.size":"desc"},{"data.docType":"desc"},{"data.owner":"desc"}]},"ddoc":"indexSizeSortDoc", "name":"indexSizeSortDesc","type":"json"}

// Rich Query with index design doc and index name specified (Only supported if CouchDB is used as state database):
//   peer chaincode query -C mychannel -n marblesp -c '{"Args":["queryMarbles","{\"selector\":{\"docType\":\"marble\",\"owner\":\"tom\"}, \"use_index\":[\"_design/indexOwnerDoc\", \"indexOwner\"]}"]}'

// Rich Query with index design doc specified only (Only supported if CouchDB is used as state database):
//   peer chaincode query -C mychannel -n marblesp -c '{"Args":["queryMarbles","{\"selector\":{\"docType\":{\"$eq\":\"marble\"},\"owner\":{\"$eq\":\"tom\"},\"size\":{\"$gt\":0}},\"fields\":[\"docType\",\"owner\",\"size\"],\"sort\":[{\"size\":\"desc\"}],\"use_index\":\"_design/indexSizeSortDoc\"}"]}'

'use strict';
const shim = require('fabric-shim');
const util = require('util');

let Chaincode = class {
  async Init(stub) {
    let ret = stub.getFunctionAndParameters();
    console.info(ret);
    console.info('=========== Instantiated Marbles Chaincode ===========');
    return shim.success();
  }

  async Invoke(stub) {
    console.info('Transaction ID: ' + stub.getTxID());
    console.info(util.format('Args: %j', stub.getArgs()));

    let ret = stub.getFunctionAndParameters();
    console.info(ret);

    let method = this[ret.fcn];
    if (!method) {
      console.log('no function of name:' + ret.fcn + ' found');
      throw new Error('Received unknown function ' + ret.fcn + ' invocation');
    }
    try {
      let payload = await method(stub, ret.params, this);
      return shim.success(payload);
    } catch (err) {
      console.log(err);
      return shim.error(err);
    }
  }

  // ===============================================
  // initMarble - create a new marble
  // ===============================================
  async initMarble(stub, args, thisClass) {
    if (args.length != 4) {
      throw new Error('Incorrect number of arguments. Expecting 4');
    }
    // ==== Input sanitation ====
    console.info('--- start init marble ---')
    if (args[0].lenth == 0) {
      throw new Error('1st argument must be a non-empty string');
    }
    if (args[1].lenth == 0) {
      throw new Error('2nd argument must be a non-empty string');
    }
    if (args[2].lenth == 0) {
      throw new Error('3rd argument must be a non-empty string');
    }
    if (args[3].lenth == 0) {
      throw new Error('4th argument must be a non-empty string');
    }
    let marbleName = args[0];
    let color = args[1].toLowerCase();
    let owner = args[3].toLowerCase();
    let size = parseInt(args[2]);
    if (typeof size !== 'number') {
      throw new Error('3rd argument must be a numeric string');
    }
    let price = parseInt(args[4]);
    if (typeof size !== 'number') {
      throw new Error('5th argument must be a numeric string');
    }
    // ==== Check if marble already exists ====
    let marbleState = await stub.getPrivateData('collectionMarbles',marbleName);
    if (marbleState.toString()) {
      throw new Error('This marble already exists: ' + marbleName);
    }

    // ==== Create marble object and marshal to JSON ====
    let marble = {};
    marble.docType = 'marble';
    marble.name = marbleName;
    marble.color = color;
    marble.size = size;
    marble.owner = owner;

    // === Save marble to state ===
    await stub.putPrivateData('collectionMarbles', marbleName, Buffer.from(JSON.stringify(marble)));

    // ==== Save marble private details ====
    let privateMarble = {};
    privateMarble.docType = 'marblePrivateDetails';
    privateMarble.name = marbleName;
    privateMarble.price = price;
    await stub.putPrivateData('collectionMarblePrivateDetails', marbleName, Buffer.from(JSON.stringify(privateMarble)));
  
    let indexName = 'color~name'
    let colorNameIndexKey = await stub.createCompositeKey(indexName, [marble.color, marble.name]);
    console.info(colorNameIndexKey);
    //  Save index entry to state. Only the key name is needed, no need to store a duplicate copy of the marble.
    //  Note - passing a 'nil' value will effectively delete the key from state, therefore we pass null character as value
    await stub.putPrivateData('collectionMarbles', colorNameIndexKey, Buffer.from('\u0000'));
    // ==== Marble saved and indexed. Return success ====
    console.info('- end init marble');
  }

  // ===============================================
  // readMarble - read a marble from chaincode state
  // ===============================================
  async readMarble(stub, args, thisClass) {
    if (args.length != 1) {
      throw new Error('Incorrect number of arguments. Expecting name of the marble to query');
    }

    let name = args[0];
    if (!name) {
      throw new Error(' marble name must not be empty');
    }
    let marbleAsbytes = await stub.getPrivateData('collectionMarbles', name); //get the marble from chaincode state
    if (!marbleAsbytes.toString()) {
      let jsonResp = {};
      jsonResp.Error = 'Marble does not exist: ' + name;
      throw new Error(JSON.stringify(jsonResp));
    }
    console.info('=======================================');
    console.log(marbleAsbytes.toString());
    console.info('=======================================');
    return marbleAsbytes;
  }

  // ===============================================
  // readMarblePrivateDetails - read a marble private details from chaincode state
  // ===============================================
  async readMarblePrivateDetails(stub, args, thisClass) {
    if (args.length != 1) {
      throw new Error('Incorrect number of arguments. Expecting name of the marble to query');
    }

    let name = args[0];
    if (!name) {
      throw new Error(' marble name must not be empty');
    }
    let marbleAsbytes = await stub.getPrivateData('collectionMarblePrivateDetails', name); //get the marble from chaincode state
    if (!marbleAsbytes.toString()) {
      let jsonResp = {};
      jsonResp.Error = 'Marble private details does not exist: ' + name;
      throw new Error(JSON.stringify(jsonResp));
    }
    console.info('=======================================');
    console.log(marbleAsbytes.toString());
    console.info('=======================================');
    return marbleAsbytes;
  }

  // ==================================================
  // delete - remove a marble key/value pair from state
  // ==================================================
  async delete(stub, args, thisClass) {
    if (args.length != 1) {
      throw new Error('Incorrect number of arguments. Expecting name of the marble to delete');
    }
    let marbleName = args[0];
    if (!marbleName) {
      throw new Error('marble name must not be empty');
    }
    // to maintain the color~name index, we need to read the marble first and get its color
    let valAsbytes = await stub.getPrivateData('collectionMarbles', marbleName); //get the marble from chaincode state
    let jsonResp = {};
    if (!valAsbytes) {
      jsonResp.error = 'marble does not exist: ' + name;
      throw new Error(jsonResp);
    }
    let marbleJSON = {};
    try {
      marbleJSON = JSON.parse(valAsbytes.toString());
    } catch (err) {
      jsonResp = {};
      jsonResp.error = 'Failed to decode JSON of: ' + marbleName;
      throw new Error(jsonResp);
    }

    await stub.delPrivateData('collectionMarbles', marbleName); //remove the marble from chaincode state

    // delete the index
    let indexName = 'color~name';
    let colorNameIndexKey = stub.createCompositeKey(indexName, [marbleJSON.color, marbleJSON.name]);
    if (!colorNameIndexKey) {
      throw new Error(' Failed to create the createCompositeKey');
    }
    //  Delete index entry to state.
    await stub.delPrivateData('collectionMarbles', colorNameIndexKey);

    //  Delete private details of marble
    await stub.delPrivateData('collectionMarblePrivateDetails', marbleName);
  }

  // ===========================================================
  // transfer a marble by setting a new owner name on the marble
  // ===========================================================
  async transferMarble(stub, args, thisClass) {
    //   0       1
    // 'name', 'bob'
    if (args.length < 2) {
      throw new Error('Incorrect number of arguments. Expecting marblename and owner')
    }

    let marbleName = args[0];
    let newOwner = args[1].toLowerCase();
    console.info('- start transferMarble ', marbleName, newOwner);

    let marbleAsBytes = await stub.getPrivateData('collectionMarbles', marbleName);
    if (!marbleAsBytes || !marbleAsBytes.toString()) {
      throw new Error('marble does not exist');
    }
    let marbleToTransfer = {};
    try {
      marbleToTransfer = JSON.parse(marbleAsBytes.toString()); //unmarshal
    } catch (err) {
      let jsonResp = {};
      jsonResp.error = 'Failed to decode JSON of: ' + marbleName;
      throw new Error(jsonResp);
    }
    console.info(marbleToTransfer);
    marbleToTransfer.owner = newOwner; //change the owner

    let marbleJSONasBytes = Buffer.from(JSON.stringify(marbleToTransfer));
    await stub.putPrivateData('collectionMarbles', marbleName, marbleJSONasBytes); //rewrite the marble

    console.info('- end transferMarble (success)');
  }

  // ===========================================================================================
  // getMarblesByRange performs a range query based on the start and end keys provided.

  // Read-only function results are not typically submitted to ordering. If the read-only
  // results are submitted to ordering, or if the query is used in an update transaction
  // and submitted to ordering, then the committing peers will re-execute to guarantee that
  // result sets are stable between endorsement time and commit time. The transaction is
  // invalidated by the committing peers if the result set has changed between endorsement
  // time and commit time.
  // Therefore, range queries are a safe option for performing update transactions based on query results.
  // ===========================================================================================
  async getMarblesByRange(stub, args, thisClass) {

    if (args.length < 2) {
      throw new Error('Incorrect number of arguments. Expecting 2');
    }

    let startKey = args[0];
    let endKey = args[1];

    let resultsIterator = await stub.getPrivateDataByRange('collectionMarbles', startKey, endKey);
    let method = thisClass['getAllResults'];
    let results = await method(resultsIterator, false);

    return Buffer.from(JSON.stringify(results));
  }

  // ==== Example: GetStateByPartialCompositeKey/RangeQuery =========================================
  // transferMarblesBasedOnColor will transfer marbles of a given color to a certain new owner.
  // Uses a GetStateByPartialCompositeKey (range query) against color~name 'index'.
  // Committing peers will re-execute range queries to guarantee that result sets are stable
  // between endorsement time and commit time. The transaction is invalidated by the
  // committing peers if the result set has changed between endorsement time and commit time.
  // Therefore, range queries are a safe option for performing update transactions based on query results.
  // ===========================================================================================
  async transferMarblesBasedOnColor(stub, args, thisClass) {

    //   0       1
    // 'color', 'bob'
    if (args.length < 2) {
      throw new Error('Incorrect number of arguments. Expecting color and owner');
    }

    let color = args[0];
    let newOwner = args[1].toLowerCase();
    console.info('- start transferMarblesBasedOnColor ', color, newOwner);

    // Query the color~name index by color
    // This will execute a key range query on all keys starting with 'color'
    let coloredMarbleResultsIterator = await stub.getPrivateDataByPartialCompositeKey('collectionMarbles', 'color~name', [color]);

    let method = thisClass['transferMarble'];
    // Iterate through result set and for each marble found, transfer to newOwner
    while (true) {
      let responseRange = await coloredMarbleResultsIterator.next();
      if (!responseRange || !responseRange.value || !responseRange.value.key) {
        return;
      }
      console.log(responseRange.value.key);

      // let value = res.value.value.toString('utf8');
      let objectType;
      let attributes;
      ({
        objectType,
        attributes
      } = await stub.splitCompositeKey(responseRange.value.key));

      let returnedColor = attributes[0];
      let returnedMarbleName = attributes[1];
      console.info(util.format('- found a marble from index:%s color:%s name:%s\n', objectType, returnedColor, returnedMarbleName));

      // Now call the transfer function for the found marble.
      // Re-use the same function that is used to transfer individual marbles
      let response = await method(stub, [returnedMarbleName, newOwner]);
    }

    let responsePayload = util.format('Transferred %s marbles to %s', color, newOwner);
    console.info('- end transferMarblesBasedOnColor: ' + responsePayload);
  }


  // ===== Example: Parameterized rich query =================================================
  // queryMarblesByOwner queries for marbles based on a passed in owner.
  // This is an example of a parameterized query where the query logic is baked into the chaincode,
  // and accepting a single query parameter (owner).
  // Only available on state databases that support rich query (e.g. CouchDB)
  // =========================================================================================
  async queryMarblesByOwner(stub, args, thisClass) {
    //   0
    // 'bob'
    if (args.length < 1) {
      throw new Error('Incorrect number of arguments. Expecting owner name.')
    }

    let owner = args[0].toLowerCase();
    let queryString = {};
    queryString.selector = {};
    queryString.selector.docType = 'marble';
    queryString.selector.owner = owner;
    let method = thisClass['getQueryResultForQueryString'];
    let queryResults = await method(stub, JSON.stringify(queryString), thisClass);
    return queryResults; //shim.success(queryResults);
  }

  // ===== Example: Ad hoc rich query ========================================================
  // queryMarbles uses a query string to perform a query for marbles.
  // Query string matching state database syntax is passed in and executed as is.
  // Supports ad hoc queries that can be defined at runtime by the client.
  // If this is not desired, follow the queryMarblesForOwner example for parameterized queries.
  // Only available on state databases that support rich query (e.g. CouchDB)
  // =========================================================================================
  async queryMarbles(stub, args, thisClass) {
    //   0
    // 'queryString'
    if (args.length < 1) {
      throw new Error('Incorrect number of arguments. Expecting queryString');
    }
    let queryString = args[0];
    if (!queryString) {
      throw new Error('queryString must not be empty');
    }
    let method = thisClass['getQueryResultForQueryString'];
    let queryResults = await method(stub, queryString, thisClass);
    return queryResults;
  }

  async getAllResults(iterator, isHistory) {
    let allResults = [];
    while (true) {
      let res = await iterator.next();

      if (res.value && res.value.value.toString()) {
        let jsonRes = {};
        console.log(res.value.value.toString('utf8'));

        if (isHistory && isHistory === true) {
          jsonRes.TxId = res.value.tx_id;
          jsonRes.Timestamp = res.value.timestamp;
          jsonRes.IsDelete = res.value.is_delete.toString();
          try {
            jsonRes.Value = JSON.parse(res.value.value.toString('utf8'));
          } catch (err) {
            console.log(err);
            jsonRes.Value = res.value.value.toString('utf8');
          }
        } else {
          jsonRes.Key = res.value.key;
          try {
            jsonRes.Record = JSON.parse(res.value.value.toString('utf8'));
          } catch (err) {
            console.log(err);
            jsonRes.Record = res.value.value.toString('utf8');
          }
        }
        allResults.push(jsonRes);
      }
      if (res.done) {
        console.log('end of data');
        await iterator.close();
        console.info(allResults);
        return allResults;
      }
    }
  }

  // =========================================================================================
  // getQueryResultForQueryString executes the passed in query string.
  // Result set is built and returned as a byte array containing the JSON results.
  // =========================================================================================
  async getQueryResultForQueryString(stub, queryString, thisClass) {

    console.info('- getQueryResultForQueryString queryString:\n' + queryString)
    let resultsIterator = await stub.getPrivateDataQueryResult('collectionMarbles', queryString);
    let method = thisClass['getAllResults'];

    let results = await method(resultsIterator, false);

    return Buffer.from(JSON.stringify(results));
  }

  async getHistoryForMarble(stub, args, thisClass) {

    if (args.length < 1) {
      throw new Error('Incorrect number of arguments. Expecting 1')
    }
    let marbleName = args[0];
    console.info('- start getHistoryForMarble: %s\n', marbleName);

    let resultsIterator = await stub.getHistoryForKey(marbleName);
    let method = thisClass['getAllResults'];
    let results = await method(resultsIterator, true);

    return Buffer.from(JSON.stringify(results));
  }
};

shim.start(new Chaincode());
