const feedback = async (req, res) => {
  try {
    const { payment_id, status } = req.query;

    return res
      .status(200)
      .redirect(`http://localhost:4321/payment/${payment_id}`);
  } catch (error) {
    return res.status(400).redirect(`http://vigi.cam`);
  }
};
module.exports = feedback;
