const path = require('path');
const cron = require('node-cron');
const { MembershipResetSMS, verifyMembershipStatus } = require(path.resolve(__dirname, 'utils', 'tasks'));
/**
 * Reset SMS limits
 * @function runs on the 1st of every month
 */
cron.schedule('* * 1 * *', MembershipResetSMS);
cron.schedule('* 0 * * *', verifyMembershipStatus);