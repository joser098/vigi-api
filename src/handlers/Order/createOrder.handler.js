const _createOrder = require("../../controllers/Order/createOrder.controller");
const getDate = require("../../services/getDate");
const _getCustomerById = require("../../controllers/Customer/getCustomerById.controller");
const addOrderToCustomer = require("../../controllers/Order/addOrderToCustomer.controller");

const createOrderHandler = async (payment_id, data, amount_paid) => {
  try {

    const formatItems = data.items.map((item) => {
      return {
        name: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
      };
    });
    data.items = formatItems;

    const order_model = {
      payment_id,
      customer_id: data.payer.first_name,
      items: data.items,
      ip_address: data.ip_address,
      amount_paid,
      status: "En preparación",
      date: getDate()
    }

    const newOrder = await _createOrder(order_model);

    if (newOrder.acknowledged && newOrder.upsertedId) {      
      addOrderToCustomer(order_model.customer_id);
    }

    return newOrder;
  } catch (error) {
    console.log(error);
    return error;
  }
};
module.exports = createOrderHandler;