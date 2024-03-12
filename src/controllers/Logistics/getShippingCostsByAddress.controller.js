const _getShippingCostsByAddress = (address) => {
    if(address.province == "Ciudad Autónoma de Buenos Aires"){
        return 0;
    }
    if(address.province == "Buenos Aires"){
        return 3999;
    }
    if(address.province !== "Buenos Aires"){
        return 8999;
    }
};

module.exports = _getShippingCostsByAddress;