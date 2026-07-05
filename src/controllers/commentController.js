const { PrismaClient } = require("@prisma/client");
const sendEmail = require("../utils/sendEmail");

const prisma = new PrismaClient();

// ADD COMMENT TO TICKET
const addComment = async (req, res) => {
  const { ticketId } = req.params;
  const { text } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        assignedAgent: { select: { id: true, name: true, email: true } },
      },
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Customers can only comment on their own tickets
    if (
      req.user.role === "customer" &&
      ticket.customerId !== req.user.id
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const comment = await prisma.ticketComment.create({
      data: {
        text,
        ticketId: parseInt(ticketId),
        userId: req.user.id,
      },
      include: {
        user: { select: { id: true, name: true, role: true, avatar: true } },
      },
    });

    // Notify the other party
    // If agent commented → notify customer
    // If customer commented → notify agent
    const notifyUser =
      req.user.role === "customer"
        ? ticket.assignedAgent
        : ticket.customer;

    if (notifyUser) {
      await sendEmail(
        notifyUser.email,
        `New Comment on Ticket #${ticket.id}`,
        `
          <h2>New Comment Added</h2>
          <p>Hi ${notifyUser.name},</p>
          <p>A new comment has been added to ticket 
          <strong>#${ticket.id} - ${ticket.title}</strong>:</p>
          <blockquote style="border-left:4px solid #2563eb;padding:12px;margin:16px 0;background:#f8f9fa;">
            ${text}
          </blockquote>
          <a href="${process.env.FRONTEND_URL}/tickets/${ticket.id}"
             style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">
            View Ticket
          </a>
        `
      );

      await prisma.notification.create({
        data: {
          userId: notifyUser.id,
          message: `New comment on ticket #${ticket.id}`,
          type: "comment_added",
          link: `/tickets/${ticket.id}`,
        },
      });
    }

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// DELETE COMMENT (admin only)
const deleteComment = async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.ticketComment.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Comment deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { addComment, deleteComment };