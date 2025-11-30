/**
 * A client for making HTTP requests with JWT authentication support.
 */
export default class BamzClient {

    /**
     * Fetches data from a given URL with optional options.
     * @param {string} url - The URL to fetch data from.
     * @param {Object} [options] - Optional fetch options.
     * @returns {Promise<Response>} The response from the fetch request.
     */
    async fetch(url, options) {
        try {
            // Initialize options if not provided
            if (!options) {
                options = {};
            }
            // Initialize headers if not provided
            if (!options.headers) {
                options.headers = {};
            }
            if (!options.headers["app-name"]) {
                options.headers["app-name"] = window.BAMZ_APP ;
            }
            
        } catch (err) {
            // Log error if local storage access fails
            console.warn("Can't access to local storage", err);
        }
        // Perform the fetch request
        return fetch(url, options);
    }

    /**
     * Sends a JSON request to the specified URL.
     * @param {string} url - The URL to send the request to.
     * @param {Object} [body={}] - The request body.
     * @param {Object} [options={}] - Optional fetch options.
     * @returns {Promise<Object>} The parsed JSON response.
     */
    async json(url, body = {}, options = {}) {
        // Clone options to avoid modifying the original object
        const opts = structuredClone(options);
        // Set default method to POST if not specified
        if (!opts.method) {
            opts.method = "POST";
        }
        // Initialize headers if not provided
        if (!opts.headers) {
            opts.headers = {};
        }
        // Set Accept and Content-Type headers
        opts.headers["Accept"] = 'application/json';
        opts.headers["Content-Type"] = 'application/json';
        // Stringify the body if provided
        if (body) {
            opts.body = JSON.stringify(body);
        }

        // Perform the fetch request
        const response = await this.fetch(url, opts);

        // Throw an error if the response is not OK
        if (!response.ok) {
            throw await response.text();
        }
        // Return the parsed JSON response
        return await response.json();
    }

    /**
     * Sends a GET request to the specified URL.
     * @param {string|Object} options - The URL or options object.
     * @param {Object} [queryParam] - Optional query parameters.
     * @returns {Promise<Object>} The parsed JSON response.
     */
    async get(options, queryParam) {
        // Handle case where options is a string
        if (typeof options === "string") {
            options = { url: options, query: queryParam };
        }
        // Destructure options to get URL and query parameters
        let { url, query } = options;
        // Append query parameters to the URL
        if (query) {
            if (url.includes("?")) {
                url += "&";
            } else {
                url += "?";
            }
            url += Object.keys(query).map(k => `${k}=${query[k]}`).join("&");
        }

        // Perform the JSON request with GET method
        return this.json(url, null, { method: "GET" });
    }

    /**
     * Sends a DELETE request to the specified URL.
     * @param {string|Object} options - The URL or options object.
     * @param {Object} [queryParam] - Optional query parameters.
     * @returns {Promise<Object>} The parsed JSON response.
     */
    async delete(options, queryParam) {
        // Handle case where options is a string
        if (typeof options === "string") {
            options = { url: options, query: queryParam };
        }
        // Destructure options to get URL and query parameters
        let { url, query } = options;
        // Append query parameters to the URL
        if (query) {
            if (url.includes("?")) {
                url += "&";
            } else {
                url += "?";
            }
            url += Object.keys(query).map(k => `${k}=${query[k]}`).join("&");
        }

        // Perform the JSON request with DELETE method
        return this.json(url, null, { method: "DELETE" });
    }

    /**
     * Sends a POST request to the specified URL.
     * @param {string|Object} options - The URL or options object.
     * @param {Object} [bodyParam] - Optional request body.
     * @returns {Promise<Object>} The parsed JSON response.
     */
    async post(options, bodyParam) {
        // Handle case where options is a string
        if (typeof options === "string") {
            options = { url: options, body: bodyParam };
        }
        // Destructure options to get URL and body
        let { url, body } = options;
        // Perform the JSON request
        return await this.json(url, body);
    }

    /**
     * Sends a form/multipart POST request to the specified URL.
     * @param {string|Object} options - The URL or options object.
     * @param {Object} [bodyParam] - Optional request body.
     * @returns {Promise<Object>} The parsed JSON response.
     */
    async multipartPost(options, bodyParam) {
        // Handle case where options is a string
        if (typeof options === "string") {
            options = { url: options, body: bodyParam };
        }
        // Destructure options to get URL and body
        let { url, body } = options;

        const formData = new FormData();
        for(let [k, value] of Object.entries(body)){
            formData.append(k, value);
        }

        let response = await this.fetch(url, {
            method: 'POST',
            body: formData
        });

        // Throw an error if the response is not OK
        if (!response.ok) {
            throw await response.text();
        }
        // Return the parsed JSON response
        return await response.json();
    }

    /**
     * Sends a PUT request to the specified URL.
     * @param {string|Object} options - The URL or options object.
     * @param {Object} [bodyParam] - Optional request body.
     * @returns {Promise<Object>} The parsed JSON response.
     */
    async put(options, bodyParam) {
        // Handle case where options is a string
        if (typeof options === "string") {
            options = { url: options, body: bodyParam };
        }
        // Destructure options to get URL and body
        let { url, body } = options;
        // Perform the JSON request with PUT method
        return await this.json(url, body, { method: "PUT" });
    }

    /**
     * Sends a PATCH request to the specified URL.
     * @param {string|Object} options - The URL or options object.
     * @param {Object} [bodyParam] - Optional request body.
     * @returns {Promise<Object>} The parsed JSON response.
     */
    async patch(options, bodyParam) {
        // Handle case where options is a string
        if (typeof options === "string") {
            options = { url: options, body: bodyParam };
        }
        // Destructure options to get URL and body
        let { url, body } = options;
        // Perform the JSON request with PATCH method
        return await this.json(url, body, { method: "PATCH" });
    }
}
