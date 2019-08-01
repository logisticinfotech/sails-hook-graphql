const _ = require('lodash');
const {
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLInputObjectType,
  GraphQLScalarType
} = require('graphql');

let skipFieldsQuery = [];
let skipFieldsMutation = [];
var gqlSchemaManager = {
  types: {},
  findArgsTypes: {},
  queries: {},
  connectionTypes: {},
  mutations: {},
  waterlineModels: []
};

module.exports = graphQLService = {
  CustomJson: new GraphQLScalarType({
    name: 'CustomJson',
    description: 'CustomJson scalar type',
    serialize(value) {
      return value; // value sent to the client
    }
    // parseValue(value) {
    //   console.log('CustomJson parseValue: ', value, typeof value);
    //   if(typeof value == "string") {
    //     console.log('CustomJson parseValue stringParse: ', JSON.parse(value));
    //     return JSON.parse(value);
    //   }
    //   return value; // value sent to the client
    // }
    // parseLiteral(ast, a, b) {
    //   console.log("CustomJson parseLiteral: ", ast);
    //   console.log("a, b", a, b);
    //   // console.log("CustomJson parseLiteral ast.name: ", ast.fields[0].name);
    //   // console.log("CustomJson parseLiteral ast.value: ", ast.fields[0].value);
    //   if (ast.kind === 'StringValue') {
    //     var jsonObj = JSON.parse(ast.value);
    //     console.log('CustomJson parseLiteral jsonObj: ', jsonObj);
    //     return jsonObj;
    //   }
    //   return ast.fields;
    // }
  }),
  waterlineTypesToGraphQLType: function (attribute) {
    var graphqlType;
    switch (attribute.type) {
      case 'string':
        graphqlType = GraphQLString;
        break;
      case 'number':
        graphqlType = GraphQLInt;
        break;
      case 'boolean':
        graphqlType = GraphQLBoolean;
        break;
      default:
        graphqlType = graphQLService.CustomJson;
    }

    if (attribute.required) {
      graphqlType = new GraphQLNonNull(graphqlType);
    }
    return graphqlType;
  },

  getFindArgsForWaterlineModel: function (modelID) {
    return {
      where: {
        name: 'criteria',
        type: graphQLService.CustomJson //gqlSchemaManager.findArgsTypes[modelID]
      },
      sort: {
        name: 'sort',
        type: GraphQLString
      },
      skip: {
        name: 'skip',
        type: GraphQLInt
      },
      limit: {
        name: 'limit',
        type: GraphQLInt
      },
      populate: {
        name: 'populate',
        type: graphQLService.CustomJson
      },
      aggregate: {
        name: 'aggregate',
        type: graphQLService.CustomJson
      }
    };
  },

  createGraphQLTypeForWaterlineModel: function (model, modelID) {
    var attributes = model.attributes;
    return new GraphQLObjectType({
      name: modelID,
      description: model.description,
      fields: () => {
        var convertedFields = {};
        // console.log("graphQLServices createGraphQLTypeForWaterlineModel attributes ", attributes)
        _.mapKeys(attributes, (attribute, key) => {
          if (attribute.type && !skipFieldsQuery.includes(key)) {
            var field = {
              type: graphQLService.waterlineTypesToGraphQLType(attribute),
              description: attribute.description
            };

            convertedFields[key] = field;
          }
        });

        console.log("addInQuery ", );
        if(model.graphql.addInQuery) {
          for (let aiq = 0; aiq < model.graphql.addInQuery.length; aiq++) {
            const fieldAdd = model.graphql.addInQuery[aiq];
            var field = {
              type: graphQLService.waterlineTypesToGraphQLType({type: 'string'}),
              description: "Extra Field"
            };
            convertedFields[fieldAdd] = field;
          }
        }

        var associations = model.associations;
        associations.forEach(association => {
          if (association.model && gqlSchemaManager.types[association.model]) {
            convertedFields[association.alias] = {
              type: gqlSchemaManager.types[association.model],
              description: association.description,
              resolve: (obj /*, args */) => {
                return gqlSchemaManager.queries[association.model][
                  association.model
                ].resolve(obj, {
                  where: {
                    id: obj[association.alias].id || obj[association.alias]
                  }
                });
              }
            };
          } else if (association.model && !gqlSchemaManager.types[association.model]) {
            // This is return value of fields if association model is not generated graphql query
            var field = {
              type: GraphQLInt,
              description: ""
            };
            convertedFields[association.alias] = field;
          }
          /*else if (association.collection) {
                                           console.log("graphQLServices createGraphQLTypeForWaterlineModel association ", association);
                                           convertedFields[association.collection + 's'] = {
                                               type: new GraphQLList(gqlSchemaManager.types[association.collection]),
                                               description: association.description,
                                               args: graphQLService.getFindArgsForWaterlineModel(association.collection, gqlSchemaManager),
                                               resolve: (obj, args) => {
                                                   var associationCriteria = {};
                                                   associationCriteria[association.via] = obj.id;
                                                   // override association's value in where criterial
                                                   var criteria = Object.assign({}, args, {
                                                       where: Object.assign({}, args.where, associationCriteria)
                                                   });
                                                   return gqlSchemaManager.queries[association.collection][association.collection + 's'].resolve(obj, criteria);
                                               }
                                           };
                                       }*/
        });
        return convertedFields;
      }
    });
  },

  createFindArgsTypeForWaterlineModel: function (model, modelID) {
    var attributes = model.attributes;
    return new GraphQLInputObjectType({
      name: `${modelID}Args`,
      description: model.description,
      fields: () => {
        var convertedFields = {};
        _.mapKeys(attributes, (attribute, key) => {
          if (attribute.type && !skipFieldsQuery.includes(key)) {
            // if (attribute.type) {
            var field = {
              type: graphQLService.waterlineTypesToGraphQLType(attribute),
              description: attribute.description
            };
            convertedFields[key] = field;
          }
        });

        var associations = model.associations;
        // TODO: how to search that records contains someof collection matched
        associations.forEach(association => {
          var field = {
            type: GraphQLString,
            description: association.description
          };
          convertedFields[association.alias] = field;
        });
        // associations.forEach((association) => {
        //   if(association.model) {
        //     convertedFields[association.alias] = {
        //       type: gqlSchemaManager.types[association.model],
        //       description: association.description,
        //       resolve: (obj, /* args */ ) => {
        //         return gqlSchemaManager.queries[association.model][association.model].resolve(obj, {
        //           where: {
        //             id: obj[association.alias].id || obj[association.alias]
        //           }
        //         });
        //       }
        //     };
        //   } else if(association.collection) {
        //     convertedFields[association.collection + 's'] = {
        //       type: new GraphQLList(gqlSchemaManager.types[association.collection]),
        //       description: association.description,
        //       args: getFindArgsForWaterlineModel(association.collection, gqlSchemaManager),
        //       resolve: (obj, /* args */ ) => {
        //         var associationCriteria = {};
        //         associationCriteria[association.via] = obj.id;
        //         // override association's value in where criterial
        //         var criteria = Object.assign({}, args, {
        //           where: Object.assign({}, args.where, associationCriteria)
        //         });
        //         return gqlSchemaManager.queries[association.collection][association.collection + 's'].resolve(obj, criteria);
        //       }
        //     };
        //   }
        // });
        return convertedFields;
      }
    });
  },

  createGraphQLQueries: function (waterlineModel, graphqlType, modelID) {
    var queries = {};
    // query to get by id
    queries[modelID] = {
      type: graphqlType,
      args: {
        id: {
          name: 'id',
          type: new GraphQLNonNull(GraphQLInt)
        },
        populate: {
          name: 'populate',
          type: graphQLService.CustomJson
        },
      },
      resolve: (obj, criteria) => {
        var { where, id } = criteria;

        var populate = criteria.populate;
        delete criteria.populate;

        var wlm = waterlineModel.find({
          id: id || (where && where.id)
        }).limit(1);
        if (populate) {
          if (populate[0].criteria) {
            wlm.populate(populate[0].type, populate[0].criteria);
          } else {
            wlm.populate(populate[0].type);
          }
        }

        return wlm.then(result => {
          return JSON.parse(JSON.stringify(result[0]));
        });
      }
    };
    // query to find based on search criteria
    queries[modelID + 's'] = {
      type: new GraphQLList(graphqlType),
      args: graphQLService.getFindArgsForWaterlineModel(modelID),
      resolve: (obj, criteria) => {
        var populate = criteria.populate;
        delete criteria.populate;
        var aggregate = criteria.aggregate;
        delete criteria.aggregate;

        var criteria = JSON.stringify(criteria)
          .replace(/gte/g, '>=')
          .replace(/gt/g, '>')
          .replace(/lte/g, '<=')
          .replace(/lt/g, '<')
          .replace(/neq/g, '!=');
        var whereClause = JSON.parse(criteria);
        for (var field in whereClause.where) {
          if (whereClause.where[field] === '') {
            delete whereClause['where'][field];
          }
        }
        var wlm = waterlineModel.find(whereClause);
        if (populate) {
          if (populate[0].criteria) {
            wlm.populate(populate[0].type, populate[0].criteria);
          } else {
            wlm.populate(populate[0].type);
          }
        }

        return wlm.then(results => {
          return JSON.parse(JSON.stringify(results));
        });
      }
    };
    return queries;
  },

  createCountQueries: function (modelID) {

    const countType = new GraphQLObjectType({
      name: 'count',
      fields: {
        count: {
          type: GraphQLInt,
          description: "return count of specific fields"
        }
      },
    });
    var queries = {};
    queries[modelID] = {
      type: countType,
      args: {
        modelName: {
          name: 'modelName',
          type: new GraphQLNonNull(GraphQLString)
        },
        where: {
          name: 'where',
          type: graphQLService.CustomJson
        },
      },
      resolve: (obj, criteria) => {
        var newCriteria;
        if (criteria.where) {
          newCriteria = JSON.stringify(criteria.where)
            .replace(/gte/g, '>=')
            .replace(/gt/g, '>')
            .replace(/lte/g, '<=')
            .replace(/lt/g, '<')
            .replace(/neq/g, '!=');
          newCriteria = JSON.parse(newCriteria);
        }
        var whereClause = newCriteria ? newCriteria : {};
        var model = sails.models[criteria.modelName];
        var wlm = model.find(whereClause);
        wlm = model.count(whereClause);
        return wlm.then(results => {
          var res = { count: results };
          return res;
        });
      }
    };
    return queries;
  },
  createSumQueries: function (modelID) {

    const sumType = new GraphQLObjectType({
      name: 'sum',
      fields: {
        sum: {
          type: GraphQLInt,
          description: "return sum of specific fields"
        }
      },
    });
    var queries = {};
    queries[modelID] = {
      type: sumType,
      args: {
        modelName: {
          name: 'modelName',
          type: new GraphQLNonNull(GraphQLString)
        },
        where: {
          name: 'where',
          type: graphQLService.CustomJson
        },
        field: {
          name: 'field',
          type: new GraphQLNonNull(GraphQLString)
        },
      },
      resolve: (obj, criteria) => {
        var newCriteria;
        if (criteria.where) {
          newCriteria = JSON.stringify(criteria.where)
            .replace(/gte/g, '>=')
            .replace(/gt/g, '>')
            .replace(/lte/g, '<=')
            .replace(/lt/g, '<')
            .replace(/neq/g, '!=');
          newCriteria = JSON.parse(newCriteria);
        }
        var whereClause = newCriteria ? newCriteria : {};
        var model = sails.models[criteria.modelName];
        var field = criteria.field;

        return model
              .sum(field)
              .where(whereClause)
              .then(results => {
                var res = { sum: results };
                return res;
              });
      }
    };
    return queries;
  },
  createAvgQueries: function (modelID) {

    const avgType = new GraphQLObjectType({
      name: 'avg',
      fields: {
        avg: {
          type: GraphQLInt,
          description: "return avg of specific fields"
        }
      },
    });
    var queries = {};
    queries[modelID] = {
      type: avgType,
      args: {
        modelName: {
          name: 'modelName',
          type: new GraphQLNonNull(GraphQLString)
        },
        where: {
          name: 'where',
          type: graphQLService.CustomJson
        },
        field: {
          name: 'field',
          type: new GraphQLNonNull(GraphQLString)
        },
      },
      resolve: (obj, criteria) => {
        var newCriteria;
        if (criteria.where) {
          newCriteria = JSON.stringify(criteria.where)
            .replace(/gte/g, '>=')
            .replace(/gt/g, '>')
            .replace(/lte/g, '<=')
            .replace(/lt/g, '<')
            .replace(/neq/g, '!=');
          newCriteria = JSON.parse(newCriteria);
        }
        var whereClause = newCriteria ? newCriteria : {};
        var model = sails.models[criteria.modelName];
        var field = criteria.field;

        return model
              .avg(field)
              .where(whereClause)
              .then(results => {
                var res = { avg: results };
                return res;
              });
      }
    };
    return queries;
  },

  capitalizeFirstLetter: function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  },

  createGraphQLMutations: function (waterlineModel, graphqlType, modelID) {
    var mutations = {};
    var attributes = waterlineModel.attributes;
    var convertedFields = {};
    _.mapKeys(attributes, (attribute, key) => {
      if (attribute.type && !skipFieldsMutation.includes(key)) {
        var field = {
          type: graphQLService.waterlineTypesToGraphQLType(attribute),
          description: attribute.description
        };
        convertedFields[key] = field;
      }
    });

    var modelIDField = convertedFields.id;

    var fieldsForCreate = _.clone(convertedFields);
    delete fieldsForCreate.id;
    mutations['create' + graphQLService.capitalizeFirstLetter(modelID)] = {
      type: graphqlType,
      args: fieldsForCreate,
      // resolve: wrapResolve(waterlineModel.create),
      resolve: async function (root, args, context, info) {
        // check context also before populating
        try {
          let query = await waterlineModel.create(args).fetch();
          // Must do 2 step query to be able to populate (same goes for update and delete)
          // for (let i = 0; i < model.associations.length; i++) {
          //   query = query.populate(model.associations[i].alias)
          // }
          return query;
        } catch (e) {
          return e;
        }
      },
      name: 'create' + modelID
    };

    mutations['update' + graphQLService.capitalizeFirstLetter(modelID)] = {
      type: graphqlType,
      args: convertedFields,
      // resolve: wrapResolve(waterlineModel.update),
      resolve: async function (root, args, context, info) {
        // // next ligne is false
        // if (!Object.keys(args).length) {
        //   return new Error(`must provide at least one parameter in `)
        // }
        // // check context also before populating
        try {
          let query = await waterlineModel
            .update({ id: args.id })
            .set(args)
            .fetch();
          return query[0];
        } catch (e) {
          return e;
        }
      },
      name: 'update' + modelID
    };

    mutations['delete' + graphQLService.capitalizeFirstLetter(modelID)] = {
      type: graphqlType,
      args: { id: modelIDField },
      // resolve: wrapResolve(waterlineModel.delete),
      resolve: async function (root, args, context, info) {
        if (!Object.keys(args).length) {
          return new Error(`must provide at least one parameter`);
        }
        // check context also before populating
        try {
          let query = await waterlineModel.destroy(args).fetch();
          // for (let i = 0; i < model.associations.length; i++) {
          //   query = query.populate(model.associations[i].alias)
          // }
          return query[0];
        } catch (e) {
          return e;
        }
      },
      name: 'delete' + modelID
    };

    return mutations;
  },

  getGraphQLSchemaFrom: function (models) {
    // if grahql disable in config/graphql.js files than we return blank from here
    if (sails.config.graphql && sails.config.graphql.disable) {
      return "";
    }
    if (!models) {
      throw new Error('Invalid input args models is' + models);
    }

    gqlSchemaManager.waterlineModels = models;

    // this is for create query of models
    _.each(models, function eachInstantiatedModel(thisModel, modelID) {
      if (thisModel.graphql && thisModel.graphql.query) {
        gqlSchemaManager.types[
          modelID
        ] = graphQLService.createGraphQLTypeForWaterlineModel(
          thisModel,
          modelID
        );
        gqlSchemaManager.findArgsTypes[
          modelID
        ] = graphQLService.createFindArgsTypeForWaterlineModel(
          thisModel,
          modelID
        );
        gqlSchemaManager.queries[modelID] = graphQLService.createGraphQLQueries(
          thisModel,
          gqlSchemaManager.types[modelID],
          modelID
        );
      }
    });
    // Create query for get global count
    gqlSchemaManager.queries["count"] = graphQLService.createCountQueries("count");
    gqlSchemaManager.queries["sum"] = graphQLService.createSumQueries("sum");
    gqlSchemaManager.queries["avg"] = graphQLService.createAvgQueries("avg");

    // this is for create mutation of models
    _.each(models, function eachInstantiatedModel(thisModel, modelID) {
      // if (thisModel.graphql && thisModel.graphql.hiddenInMutation) {
      //   skipFieldsMutation = thisModel.graphql.hiddenInMutation;
      // }
      // check if global setting available for hidden any fields for mutations
      if (thisModel.graphql && (thisModel.graphql.hiddenInMutation || (sails.config.graphql && sails.config.graphql.hiddenInMutation))) {
        skipFieldsMutation = _.concat(thisModel.graphql.hiddenInMutation, sails.config.graphql.hiddenInMutation);
        skipFieldsMutation = _.compact(skipFieldsMutation);
      }
      // if (thisModel.graphql && thisModel.graphql.hiddenInQuery) {
      //   skipFieldsQuery = thisModel.graphql.hiddenInQuery;
      // }

      // check if global setting available for hidden any fields for query
      if (thisModel.graphql && (thisModel.graphql.hiddenInQuery || (sails.config.graphql && sails.config.graphql.hiddenInQuery))) {
        skipFieldsQuery = _.concat(thisModel.graphql.hiddenInQuery, sails.config.graphql.hiddenInQuery);
        skipFieldsQuery = _.compact(skipFieldsQuery);
      }
      if (thisModel.graphql && thisModel.graphql.mutation) {
        gqlSchemaManager.mutations[
          modelID
        ] = graphQLService.createGraphQLMutations(
          thisModel,
          gqlSchemaManager.types[modelID],
          modelID
        );
      }
    });

    var queryType = new GraphQLObjectType({
      name: 'Query',
      fields: () => {
        return _.reduce(gqlSchemaManager.queries, (total, obj, key) => {
          return _.merge(total, obj);
        });
      }
    });
    var mutationFields = _.reduce(
      gqlSchemaManager.mutations,
      (total, obj, key) => {
        return _.merge(total, obj);
      }
    );

    var schema;
    if (mutationFields) {
      var mutationType = new GraphQLObjectType({
        name: 'Mutation',
        fields: mutationFields
      });
      schema = new GraphQLSchema({
        query: queryType,
        mutation: mutationType
      });
    } else {
      schema = new GraphQLSchema({
        query: queryType
      });
    }

    return schema;
  }
};
