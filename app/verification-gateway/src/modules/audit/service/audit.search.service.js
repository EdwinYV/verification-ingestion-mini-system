const { getElasticsearchClient, verificationLogIndex } = require('../../../config/elasticsearch');

class AuditSearchService {
  async search(query) {
    const {
      q,
      page = 1,
      limit = 20,
      status,
      type,
      mode,
      clientOrganizationId,
      from,
      to,
    } = query;

    const must = [];
    const filter = [];

    if (q) {
      must.push({
        multi_match: {
          query: q,
          fields: ['searchText', 'searchId', 'errorMessage'],
        },
      });
    }

    if (status) filter.push({ term: { status } });
    if (type) filter.push({ term: { verificationType: type } });
    if (mode) filter.push({ term: { mode } });
    if (clientOrganizationId) filter.push({ term: { clientOrganizationId } });

    if (from || to) {
      const range = {};
      if (from) range.gte = from;
      if (to) range.lte = to;
      filter.push({ range: { requestedAt: range } });
    }

    const fromOffset = (page - 1) * limit;

    const client = getElasticsearchClient();
    const response = await client.search({
      index: verificationLogIndex.index,
      from: fromOffset,
      size: limit,
      track_total_hits: true,
      sort: [{ requestedAt: 'desc' }],
      query: {
        bool: {
          must,
          filter,
        },
      },
      aggs: {
        status: { terms: { field: 'status' } },
        verificationType: { terms: { field: 'verificationType' } },
        mode: { terms: { field: 'mode' } },
      },
    });

    const hits = response.hits?.hits || [];
    const total = response.hits?.total?.value ?? 0;

    return {
      data: hits.map((hit) => hit._source),
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
      aggregations: response.aggregations || {},
    };
  }
}

module.exports = new AuditSearchService();
