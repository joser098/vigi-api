const feedback = async (req, res) => {
  try {
    const { payment_id, status } = req.query;

    return res
      .status(200)
      .redirect(`http://vigi.cam?payment_id=${payment_id}&status=${status}`);
  } catch (error) {
    return res.status(400).redirect(`http://vigi.cam`);
  }
};
module.exports = feedback;
