export declare const config: {
    port: string | number;
    nodeEnv: string;
    mongodb: {
        uri: string;
        options: {
            maxPoolSize: number;
            minPoolSize: number;
            serverSelectionTimeoutMS: number;
        };
    };
    redis: {
        host: string;
        port: number;
        password: string | undefined;
        db: number;
        keyPrefix: string;
        ttl: {
            product: number;
            productList: number;
            category: number;
        };
    };
    otel: {
        serviceName: string;
        exporterEndpoint: string;
        tracesEndpoint: string;
        metricsEndpoint: string;
    };
    pagination: {
        defaultLimit: number;
        maxLimit: number;
    };
    search: {
        fuzzyMatchingThreshold: number;
        maxSearchResults: number;
    };
};
//# sourceMappingURL=index.d.ts.map