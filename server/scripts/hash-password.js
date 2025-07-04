/**
 * Password Hashing Utility
 * Use this script to generate secure password hashes for admin authentication
 * 
 * Usage: node scripts/hash-password.js [password]
 * or: npm run hash-password
 */

const bcrypt = require('bcryptjs');
const readline = require('readline');

async function hashPassword(password) {
    try {
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);
        return hash;
    } catch (error) {
        console.error('Error hashing password:', error);
        throw error;
    }
}

async function main() {
    // Check if password was provided as command line argument
    const password = process.argv[2];
    
    if (password) {
        // Password provided via command line
        try {
            const hash = await hashPassword(password);
            console.log('\n🔐 Password Hash Generated:');
            console.log('================================');
            console.log(hash);
            console.log('================================');
            console.log('\n📝 Copy this hash to your .env file:');
            console.log(`ADMIN_PASSWORD_HASH=${hash}`);
            console.log('\n⚠️  Keep this hash secure and never share it!');
        } catch (error) {
            console.error('❌ Failed to hash password:', error.message);
            process.exit(1);
        }
    } else {
        // Interactive mode
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // Hide input for password
        const originalWrite = process.stdout.write;
        let hidden = false;

        process.stdout.write = function(string, encoding, fd) {
            if (hidden) return true;
            return originalWrite.call(process.stdout, string, encoding, fd);
        };

        rl.question('Enter the admin password: ', async (inputPassword) => {
            hidden = false;
            
            if (!inputPassword || inputPassword.trim().length === 0) {
                console.log('\n❌ Password cannot be empty!');
                rl.close();
                process.exit(1);
            }

            if (inputPassword.length < 8) {
                console.log('\n⚠️  Warning: Password is less than 8 characters. Consider using a stronger password.');
            }

            try {
                const hash = await hashPassword(inputPassword);
                console.log('\n🔐 Password Hash Generated:');
                console.log('================================');
                console.log(hash);
                console.log('================================');
                console.log('\n📝 Copy this hash to your .env file:');
                console.log(`ADMIN_PASSWORD_HASH=${hash}`);
                console.log('\n⚠️  Keep this hash secure and never share it!');
                console.log('\n✅ Password hashing completed successfully.');
            } catch (error) {
                console.error('\n❌ Failed to hash password:', error.message);
                process.exit(1);
            }

            rl.close();
        });

        hidden = true;
    }
}

// Verification function to test a password against a hash
async function verifyPassword(password, hash) {
    try {
        const isValid = await bcrypt.compare(password, hash);
        return isValid;
    } catch (error) {
        console.error('Error verifying password:', error);
        return false;
    }
}

// Export functions for use in other modules
module.exports = {
    hashPassword,
    verifyPassword
};

// Run the script if called directly
if (require.main === module) {
    console.log('🔐 3D Printing Analytics - Password Hash Generator');
    console.log('==================================================');
    console.log('This utility generates secure bcrypt hashes for admin authentication.\n');
    
    main().catch(error => {
        console.error('❌ Script failed:', error.message);
        process.exit(1);
    });
}