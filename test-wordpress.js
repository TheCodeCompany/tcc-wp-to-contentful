/**
 * WordPress API Connectivity Test
 * Run this to test your WordPress API connection before running the full migration
 */

const axios = require('axios')

// Load configuration
let config;
try {
  config = require('./config');
} catch (error) {
  console.error('❌ Configuration file not found!');
  console.error('Please copy config.template.js to config.js and fill in your credentials.');
  process.exit(1);
}

console.log('🔧 WordPress API Connectivity Test')
console.log('==================================')

console.log(`\n📡 Testing WordPress endpoint: ${config.wordpress.endpoint}`)

async function testWordPressAPI() {
  try {
    // Test basic connectivity
    console.log('\n1. 🔗 Testing basic connectivity...')
    const response = await axios.get(`${config.wordpress.endpoint}posts?per_page=1`)
    console.log('   ✅ WordPress API is accessible')
    
    // Check post count
    const totalPosts = response.headers['x-wp-total'] ? parseInt(response.headers['x-wp-total']) : 'unknown'
    console.log(`   📊 Total published posts: ${totalPosts}`)
    console.log(`   📊 Requested import count: ${config.wordpress.importPostCount}`)
    
    if (totalPosts !== 'unknown' && totalPosts < config.wordpress.importPostCount) {
      console.log(`   ⚠️  Warning: You want to import ${config.wordpress.importPostCount} posts, but only ${totalPosts} are available`)
    }
    
    // Test other endpoints
    console.log('\n2. 🏷️  Testing other endpoints...')
    const endpoints = ['tags', 'categories', 'media']
    
    for (const endpoint of endpoints) {
      try {
        const endpointResponse = await axios.get(`${config.wordpress.endpoint}${endpoint}?per_page=1`)
        const count = endpointResponse.headers['x-wp-total'] ? parseInt(endpointResponse.headers['x-wp-total']) : 'unknown'
        console.log(`   ✅ ${endpoint}: ${count} items available`)
      } catch (error) {
        console.log(`   ⚠️  ${endpoint}: ${error.response?.status || 'Error'} - ${error.message}`)
      }
    }
    
    // Test a larger sample
    console.log('\n3. 📝 Testing larger data fetch...')
    const testCount = Math.min(config.wordpress.importPostCount, 10) // Test with max 10 posts
    const largerResponse = await axios.get(`${config.wordpress.endpoint}posts?per_page=${testCount}`)
    console.log(`   ✅ Successfully fetched ${largerResponse.data.length} posts`)
    
    if (largerResponse.data.length > 0) {
      const firstPost = largerResponse.data[0]
      console.log(`   📄 Sample post: "${firstPost.title.rendered}" (${firstPost.slug})`)
      console.log(`   📅 Published: ${firstPost.date}`)
      console.log(`   🖼️  Featured media: ${firstPost.featured_media || 'none'}`)
    }
    
    console.log('\n✅ WordPress API test complete!')
    console.log('🚀 You can now run the migration with: npm run migrate')
    
  } catch (error) {
    console.error('\n❌ WordPress API test failed:')
    console.error(`Status: ${error.response?.status}`)
    console.error(`Message: ${error.message}`)
    console.error(`URL: ${error.config?.url}`)
    
    if (error.response?.status === 404) {
      console.error('\n🔍 404 Error - Check your WordPress endpoint:')
      console.error('- Make sure the URL is correct')
      console.error('- Ensure WordPress REST API is enabled')
      console.error('- Try visiting the URL in your browser')
    } else if (error.code === 'ENOTFOUND') {
      console.error('\n🌐 Network Error:')
      console.error('- Check your internet connection')
      console.error('- Verify the WordPress site is accessible')
    }
  }
}

testWordPressAPI();
