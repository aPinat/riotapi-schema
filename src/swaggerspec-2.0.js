const hash = require('object-hash');

function toSpec({ endpoints, regions, description }) {
  let methods = [].concat.apply([], endpoints.map(endpoint => endpoint.methods));
  let paths = {};
  methods.forEach(method => {
    let path = paths[method.getPathUrl()] || (paths[method.getPathUrl()] = {});
    let op = path[method.httpMethod] = method.getOperation();
    op.produces = 'application/json';
    if (op.parameters) {
      op.parameters.forEach(param => {
        // Merge schema into param obj.
        // https://github.com/OAI/OpenAPI-Specification/blob/master/versions/2.0.md#parameterObject
        let schema = param.schema;
        delete param.schema;
        Object.assign(param, schema);
      });
    }
    if (op.requestBody) {
      op.consumes = [ 'application/json' ];
      op.requestBody.schema = op.requestBody.content['application/json'].schema;
      delete op.requestBody.content;
      op.requestBody.in = 'body';
      if (!op.parameters)
        op.parameters = [];
      op.parameters.push(op.requestBody);
      delete op.requestBody;
    }
  });

  let schemas = {
    Error: {
      "properties": {
        "status": {
          "type": "object",
          "properties": {
            "status_code": {
              "type": "integer"
            },
            "message": {
              "type": "string"
            }
          }
        }
      }
    }
  };
  methods.forEach(method => {
    method.dtos.forEach(dto => {
      let schema = schemas[method.endpoint.name + '.' + dto.name] = dto.toSchema();
      // Override anyOf for v2.0.
      if (!schema.type && schema.anyOf) {
        delete schema.anyOf;
        schema.type = 'string';
      }
    });
  });

  let spec = {
    swagger: "2.0",
    info: {
      title: "Riot API",
      description,
      termsOfService: "https://developer.riotgames.com/terms-and-conditions.html"
    },
    host: "{platform}.api.riotgames.com",
    'x-host-platform': regions.service.map(r => r.hostPlatform),
    schemes: [ "https" ],
    paths,
    definitions: schemas,
    securityDefinitions: {
      'api_key': {
        type: 'apiKey',
        description: 'API key in query param.',
        name: 'api_key',
        in: 'query'
      },
      'X-Riot-Token': {
        type: 'apiKey',
        description: 'API key in header.',
        name: 'X-Riot-Token',
        in: 'header'
      }
    },
    security: [
      { 'api_key': [] },
      { 'X-Riot-Token': [] }
    ]
  };

  const ignored = [ 'info', 'tags' ];
  let versioned = {};
  for (let [ key, value ] of Object.entries(spec)) {
    if (!ignored.includes(key))
      versioned[key] = value;
  }
  spec.info.version = hash(versioned);

  // Update `$ref`s.
  function ref(obj) {
    if ('object' !== typeof obj)
      return;
    Object.keys(obj).forEach(key => {
      if ('$ref' === key) {
        obj[key] = obj[key].replace(/^#\/components\/schemas/, '#/definitions');
      }
      ref(obj[key]);
    });
  }
  ref(spec);

  return spec;
};

module.exports = {
  toSpec,
  name: 'swaggerspec-2.0'
};