'use strict';

const assert = require('assert');
const _ = require('lodash');
const Promise = require('bluebird');
const errors = require('../errors');
const utils = require('../utils');
const catalog = require('../models/catalog');
const FabrikBaseController = require('./FabrikBaseController');
const lockManager = require('../../../eventmesh').lockManager;
const AssertionError = assert.AssertionError;
const BadRequest = errors.BadRequest;
const PreconditionFailed = errors.PreconditionFailed;
const ServiceInstanceAlreadyExists = errors.ServiceInstanceAlreadyExists;
const ServiceInstanceNotFound = errors.ServiceInstanceNotFound;
const ServiceBindingAlreadyExists = errors.ServiceBindingAlreadyExists;
const ServiceBindingNotFound = errors.ServiceBindingNotFound;
const ContinueWithNext = errors.ContinueWithNext;
const config = require('../config');
const CONST = require('../constants');

class ServiceBrokerApiController extends FabrikBaseController {
  constructor() {
    super();
  }

  apiVersion(req, res) {
    /* jshint unused:false */
    const minVersion = CONST.SF_BROKER_API_VERSION_MIN;
    const version = _.get(req.headers, 'x-broker-api-version', '1.0');
    return Promise
      .try(() => {
        if (utils.compareVersions(version, minVersion) >= 0) {
          return;
        } else {
          throw new PreconditionFailed(`At least Broker API version ${minVersion} is required.`);
        }
      })
      .throw(new ContinueWithNext());
  }

  getCatalog(req, res) {
    /* jshint unused:false */
    res.status(CONST.HTTP_STATUS_CODE.OK).json(this.fabrik.getPlatformManager(req.params.platform).getCatalog(catalog));
  }

  putInstance(req, res) {
    if (config.enable_service_fabrik_v2) {
      return this.putInstanceV2(req, res);
    }
    return this.putInstanceV1(req, res);
  }

  putInstanceV1(req, res) {
    const params = _.omit(req.body, 'plan_id', 'service_id');

    function done(result) {
      let statusCode = CONST.HTTP_STATUS_CODE.CREATED;
      const body = {
        dashboard_url: req.instance.dashboardUrl
      };
      if (req.instance.async) {
        statusCode = CONST.HTTP_STATUS_CODE.ACCEPTED;
        body.operation = utils.encodeBase64(result);
      }
      res.status(statusCode).send(body);
    }

    function conflict(err) {
      /* jshint unused:false */
      res.status(CONST.HTTP_STATUS_CODE.CONFLICT).send({});
    }

    req.operation_type = CONST.OPERATION_TYPE.CREATE;

    return Promise
      .try(() => req.instance.create(params))
      .then(done)
      .catch(ServiceInstanceAlreadyExists, conflict);
  }

  putInstanceV2(req, res) {
    const params = _.omit(req.body, 'plan_id', 'service_id');

    function done(result) {
      let statusCode = CONST.HTTP_STATUS_CODE.CREATED;
      const body = {
        dashboard_url: req.instance.dashboardUrl
      };
      if (req.instance.async) {
        statusCode = CONST.HTTP_STATUS_CODE.ACCEPTED;
        body.operation = utils.encodeBase64(result);
      }
      res.status(statusCode).send(body);
    }

    function conflict(err) {
      /* jshint unused:false */
      res.status(CONST.HTTP_STATUS_CODE.CONFLICT).send({});
    }

    req.operation_type = CONST.OPERATION_TYPE.CREATE;

    return req.instance.create(params)
      .then(done)
      // Release lock in case of error: catch and throw
      .catch(err => {
        return lockManager.unlock(req.params.instance_id)
          .throw(err);
      })
      .catch(ServiceInstanceAlreadyExists, conflict);
  }

  patchInstance(req, res) {
    if (config.enable_service_fabrik_v2) {
      return this.patchInstanceV2(req, res);
    }
    return this.patchInstanceV1(req, res);
  }

  patchInstanceV1(req, res) {
    const params = _
      .chain(req.body)
      .omit('plan_id', 'service_id')
      .cloneDeep()
      .value();
    //cloning here so that the DirectorInstance.update does not unset the 'service-fabrik-operation' from original req.body object

    function done(result) {
      let statusCode = CONST.HTTP_STATUS_CODE.OK;
      const body = {};
      if (req.instance.async) {
        statusCode = CONST.HTTP_STATUS_CODE.ACCEPTED;
        body.operation = utils.encodeBase64(result);
      } else if (result && result.description) {
        body.description = result.description;
      }
      res.status(statusCode).send(body);
    }

    req.operation_type = CONST.OPERATION_TYPE.UPDATE;

    return Promise
      .try(() => {
        if (!req.manager.isUpdatePossible(params.previous_values.plan_id)) {
          throw new BadRequest(`Update to plan '${req.manager.plan.name}' is not possible`);
        }
        return req.instance.update(params);
      })
      .then(done);
  }

  patchInstanceV2(req, res) {
    const params = _
      .chain(req.body)
      .omit('plan_id', 'service_id')
      .cloneDeep()
      .value();
    //cloning here so that the DirectorInstance.update does not unset the 'service-fabrik-operation' from original req.body object

    function done(result) {
      let statusCode = CONST.HTTP_STATUS_CODE.OK;
      const body = {};
      if (req.instance.async) {
        statusCode = CONST.HTTP_STATUS_CODE.ACCEPTED;
        body.operation = utils.encodeBase64(result);
      } else if (result && result.description) {
        body.description = result.description;
      }
      res.status(statusCode).send(body);
    }

    req.operation_type = CONST.OPERATION_TYPE.UPDATE;
    return Promise
      .try(() => {
        if (!req.manager.isUpdatePossible(params.previous_values.plan_id)) {
          throw new BadRequest(`Update to plan '${req.manager.plan.name}' is not possible`);
        }
        return req.instance.update(params);
      })
      .then(done)
      .catch(err => {
        return lockManager.unlock(req.params.instance_id)
          .throw(err);
      });
  }

  deleteInstance(req, res) {
    if (config.enable_service_fabrik_v2) {
      return this.deleteInstanceV2(req, res);
    }
    return this.deleteInstanceV1(req, res);
  }

  deleteInstanceV1(req, res) {
    const params = _.omit(req.query, 'plan_id', 'service_id');

    function done(result) {
      let statusCode = CONST.HTTP_STATUS_CODE.OK;
      const body = {};
      if (req.instance.async) {
        statusCode = CONST.HTTP_STATUS_CODE.ACCEPTED;
        body.operation = utils.encodeBase64(result);
      }
      res.status(statusCode).send(body);
    }

    function gone(err) {
      /* jshint unused:false */
      res.status(CONST.HTTP_STATUS_CODE.GONE).send({});
    }
    req.operation_type = CONST.OPERATION_TYPE.DELETE;

    return Promise
      .try(() => req.instance.delete(params))
      .then(done)
      .catch(ServiceInstanceNotFound, gone);
  }

  deleteInstanceV2(req, res) {
    const params = _.omit(req.query, 'plan_id', 'service_id');

    function done(result) {
      let statusCode = CONST.HTTP_STATUS_CODE.OK;
      const body = {};
      if (req.instance.async) {
        statusCode = CONST.HTTP_STATUS_CODE.ACCEPTED;
        body.operation = utils.encodeBase64(result);
      }
      res.status(statusCode).send(body);
    }

    function gone(err) {
      /* jshint unused:false */
      res.status(CONST.HTTP_STATUS_CODE.GONE).send({});
    }
    req.operation_type = CONST.OPERATION_TYPE.DELETE;
    return req.instance.delete(params)
      .then(done)
      .catch(err => {
        return lockManager.unlock(req.params.instance_id)
          .throw(err);
      })
      .catch(ServiceInstanceNotFound, gone);
  }

  getLastInstanceOperation(req, res) {
    if (config.enable_service_fabrik_v2) {
      return this.getLastInstanceOperationV2(req, res);
    }
    return this.getLastInstanceOperationV1(req, res);
  }

  getLastInstanceOperationV1(req, res) {
    const encodedOp = _.get(req, 'query.operation', undefined);
    const operation = encodedOp === undefined ? null : utils.decodeBase64(encodedOp);
    const action = _.capitalize(operation.type);
    const instanceType = req.instance.constructor.typeDescription;
    const guid = req.instance.guid;

    function done(result) {
      const body = _.pick(result, 'state', 'description');
      res.status(CONST.HTTP_STATUS_CODE.OK).send(body);
    }

    function failed(err) {
      res.status(CONST.HTTP_STATUS_CODE.OK).send({
        state: 'failed',
        description: `${action} ${instanceType} '${guid}' failed because "${err.message}"`
      });
    }

    function gone() {
      res.status(CONST.HTTP_STATUS_CODE.GONE).send({});
    }

    function notFound(err) {
      if (operation.type === 'delete') {
        return gone();
      }
      failed(err);
    }
    return Promise
      .try(() => req.instance.lastOperation(operation))
      .then(done)
      .catch(AssertionError, failed)
      .catch(ServiceInstanceNotFound, notFound);
  }

  getLastInstanceOperationV2(req, res) {
    const encodedOp = _.get(req, 'query.operation', undefined);
    const operation = encodedOp === undefined ? null : utils.decodeBase64(encodedOp);
    const action = _.capitalize(operation.type);
    const instanceType = req.instance.constructor.typeDescription;
    const guid = req.instance.guid;

    function done(result) {
      const body = _.pick(result, 'state', 'description');
      // Unlock resource if state is succeeded or failed
      if (result.state === CONST.OPERATION.SUCCEEDED || result.state === CONST.OPERATION.FAILED) {
        return lockManager.unlock(req.params.instance_id)
          .then(() => res.status(CONST.HTTP_STATUS_CODE.OK).send(body));
      }
      res.status(CONST.HTTP_STATUS_CODE.OK).send(body);
    }

    function failed(err) {
      return lockManager.unlock(req.params.instance_id)
        .then(() => res.status(CONST.HTTP_STATUS_CODE.OK).send({
          state: CONST.OPERATION.FAILED,
          description: `${action} ${instanceType} '${guid}' failed because "${err.message}"`
        }));
    }

    function gone() {
      return lockManager.unlock(req.params.instance_id)
        .then(() => res.status(CONST.HTTP_STATUS_CODE.GONE).send({}));
    }

    function notFound(err) {
      if (operation.type === 'delete') {
        return gone();
      }
      failed(err);
    }

    // Check if lock is present, if not then put a lock else proceed.
    // Required for migrating from sf1.0 to sf2.0 to handle ongoing operations which don't have etcd lock
    return req.instance.lastOperation(operation)
      .then(done)
      .catch(AssertionError, failed)
      .catch(ServiceInstanceNotFound, notFound);
  }

  putBinding(req, res) {
    if (config.enable_service_fabrik_v2) {
      return this.putBindingV2(req, res);
    }
    return this.putBindingV1(req, res);
  }

  putBindingV1(req, res) {
    const params = _(req.body)
      .omit('plan_id', 'service_id')
      .set('binding_id', req.params.binding_id)
      .value();

    function done(credentials) {
      res.status(CONST.HTTP_STATUS_CODE.CREATED).send({
        credentials: credentials
      });
    }

    function conflict(err) {
      /* jshint unused:false */
      res.status(CONST.HTTP_STATUS_CODE.CONFLICT).send({});
    }

    return Promise
      .try(() => req.instance.bind(params))
      .then(done)
      .catch(ServiceBindingAlreadyExists, conflict);
  }

  putBindingV2(req, res) {
    const params = _(req.body)
      .omit('plan_id', 'service_id')
      .set('binding_id', req.params.binding_id)
      .value();

    function done(credentials) {
      res.status(CONST.HTTP_STATUS_CODE.CREATED).send({
        credentials: credentials
      });
    }

    function conflict(err) {
      /* jshint unused:false */
      res.status(CONST.HTTP_STATUS_CODE.CONFLICT).send({});
    }

    // Check if write locked
    return req.instance.bind(params)
      .then(done)
      .catch(ServiceBindingAlreadyExists, conflict);
  }

  deleteBinding(req, res) {
    if (config.enable_service_fabrik_v2) {
      return this.deleteBindingV2(req, res);
    }
    return this.deleteBindingV1(req, res);
  }

  deleteBindingV1(req, res) {
    const params = _(req.query)
      .omit('plan_id', 'service_id')
      .set('binding_id', req.params.binding_id)
      .value();

    function done() {
      res.status(CONST.HTTP_STATUS_CODE.OK).send({});
    }

    function gone(err) {
      /* jshint unused:false */
      res.status(CONST.HTTP_STATUS_CODE.GONE).send({});
    }

    return Promise
      .try(() => req.instance.unbind(params))
      .then(done)
      .catch(ServiceBindingNotFound, gone);
  }

  deleteBindingV2(req, res) {
    const params = _(req.query)
      .omit('plan_id', 'service_id')
      .set('binding_id', req.params.binding_id)
      .value();

    function done() {
      res.status(CONST.HTTP_STATUS_CODE.OK).send({});
    }

    function gone(err) {
      /* jshint unused:false */
      res.status(CONST.HTTP_STATUS_CODE.GONE).send({});
    }
    // Check if write locked
    return req.instance.unbind(params)
      .then(done)
      .catch(ServiceBindingNotFound, gone);
  }

}

module.exports = ServiceBrokerApiController;