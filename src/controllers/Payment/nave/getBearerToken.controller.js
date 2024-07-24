const client_id = process.env.NAVE_CLIENT_ID
const client_secret = process.env.NAVE_CLIENT_SECRET
const auth_url = process.env.NAVE_AUTH_URL
const audience = process.env.NAVE_AUDIENCE

const _getBearerToken = async () => {
    //Format data 
    const _body = {
        client_id,
        client_secret,
        audience,
        cache: true
    }

    //Request to get token
    const response = await fetch(auth_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(_body)
    });

    //Format response
    const data = await response.json();

    return data;
};

module.exports = _getBearerToken;