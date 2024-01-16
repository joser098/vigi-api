const getDate = () => {
    const locale = "es-AR";
    const date = new Date();

    const options = {
        timeZone: "America/Argentina/Buenos_Aires",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
    };

    const dateFormatted = new Intl.DateTimeFormat(locale, options).format(date);

    return dateFormatted;
};
module.exports = getDate;