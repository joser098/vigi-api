const { formatItemsToNaveBody } = require("../../../services/scripts");
const crypto = require("node:crypto");
const paymentRepository = require("../../../repositories/payment.repository");

const _createPaymentOrderNave = async (bearer_token, payer, items, amount_to_pay) => {
    const url = process.env.NAVE_CREATE_PAYMENT_ORDER_URL;
    const order_id = crypto.randomUUID();

    const _body = {
        platform: "vigi",
        store_id: "store_1_vigi",
        callback_url: "https://www.vigi.cam/profile#purchases",
        order_id,
        mobile: false, //TODO: Get from props
        payment_request: {
            transactions: [
                {
                    products: formatItemsToNaveBody(items),
                    amount: {
                        currency: "ARS",
                        value: amount_to_pay.toString(),
                    }
                }
            ],
            buyer: {
                user_id: payer.email,
                doc_type: "DNI",
                doc_number: payer.user_data.DNI,
                user_email: payer.email,
                name: payer.user_data.name,
                phone: payer.user_data.phone,
                billing_address: {
                    street_1: payer.user_data.address.address_name,
                    street_2: "N/A",
                    city: "1",
                    region: payer.user_data.address.province,
                    country: "AR",
                    zipcode: payer.user_data.address.zip_code
                }
            }
        }
    };

    //Fecth payment order
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `${bearer_token.token_type} ${bearer_token.access_token}`
        },
        body: JSON.stringify(_body)
    });

    const data = await response.json();

    if(data){
        // The creation timestamp used to be baked into the status string; it is
        // the created_at column now.
        await paymentRepository.createNave({
            payment_request_id: data.data.payment_request_id,
            order_id,
            customer_id: payer.id,
            status: "CREATED",
            payer: {
                id: payer.id,
                name: payer.user_data.name,
                email: payer.email,
                phone: payer.user_data.phone,
                address: payer.user_data.address
            },
            items,
            raw: data
        });
    }

    return data.data;
};

module.exports = _createPaymentOrderNave;