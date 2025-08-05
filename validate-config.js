/**
 * Simple Contentful Configuration Validator
 * Run this to test your Contentful connection before running the full migration
 */

const contentful = require('contentful-management')

// Load configuration
let config;
try {
  config = require('./config');
} catch (error) {
  console.error('❌ Configuration file not found!');
  console.error('Please copy config.template.js to config.js and fill in your credentials.');
  process.exit(1);
}

console.log('🔧 Contentful Configuration Validator')
console.log('=====================================')

// Basic validation
console.log('\n1. 📋 Checking configuration...')
console.log(`   Space ID: ${config.contentful.spaceId}`)
console.log(`   Environment: ${config.contentful.environment}`)
console.log(`   Content Type: ${config.contentful.contentType}`)
console.log(`   Content Format: ${config.contentful.contentFormat || 'richtext'}`)
console.log(`   Access Token: ${config.contentful.accessToken.substring(0, 10)}...`)

if (!config.contentful.accessToken.startsWith('CFPAT-')) {
  console.error('❌ Invalid access token format! Must start with CFPAT-')
  process.exit(1)
}

// Create client
const client = contentful.createClient({
  accessToken: config.contentful.accessToken
})

async function validateConnection() {
  try {
    console.log('\n2. 🔗 Testing space connection...')
    const space = await client.getSpace(config.contentful.spaceId)
    console.log(`   ✅ Connected to space: "${space.name}"`)

    console.log('\n3. 🌍 Testing environment access...')
    const environment = await space.getEnvironment(config.contentful.environment)
    console.log(`   ✅ Connected to environment: "${environment.sys.id}"`)

    console.log('\n4. 📋 Checking content types...')
    const contentTypes = await environment.getContentTypes()
    
    if (contentTypes.items.length === 0) {
      console.log('   ⚠️  No content types found in this space')
    } else {
      console.log('   Available content types:')
      contentTypes.items.forEach(ct => {
        console.log(`     - ${ct.sys.id} (${ct.name})`)
      })
    }

    const targetContentType = contentTypes.items.find(ct => ct.sys.id === config.contentful.contentType)
    if (targetContentType) {
      console.log(`   ✅ Target content type "${config.contentful.contentType}" found`)
      
      console.log('\n5. 🔧 Checking content type fields...')
      console.log('   Required fields for migration:')
      const requiredFields = [
        { id: 'postTitle', expectedType: 'Symbol' },
        { id: 'slug', expectedType: 'Symbol' },
        { id: 'content', expectedType: config.contentful.contentFormat === 'richtext' ? 'RichText' : 'Text' },
        { id: 'publishDate', expectedType: 'Date' }
      ]
      const optionalFields = [
        { id: 'featuredImage', expectedType: 'Link' },
        { id: 'tags', expectedType: 'Symbol' },
        { id: 'categories', expectedType: 'Symbol' }
      ]
      
      requiredFields.forEach(({ id: fieldId, expectedType }) => {
        const field = targetContentType.fields.find(f => f.id === fieldId)
        if (field) {
          if (field.type === expectedType) {
            console.log(`     ✅ ${fieldId} (${field.type}) - matches expected type`)
          } else {
            console.log(`     ⚠️  ${fieldId} (${field.type}) - expected ${expectedType}`)
            if (fieldId === 'content') {
              console.log(`        💡 Tip: Change contentFormat in config.js to '${field.type === 'RichText' ? 'richtext' : 'markdown'}'`)
            }
          }
        } else {
          console.log(`     ❌ ${fieldId} - MISSING`)
        }
      })
      
      console.log('   Optional fields:')
      optionalFields.forEach(({ id: fieldId, expectedType }) => {
        const field = targetContentType.fields.find(f => f.id === fieldId)
        if (field) {
          console.log(`     ✅ ${fieldId} (${field.type})`)
        } else {
          console.log(`     ⚠️  ${fieldId} - not found (optional)`)
        }
      })
      
    } else {
      console.log(`   ❌ Target content type "${config.contentful.contentType}" not found`)
      console.log('   You need to either:')
      console.log('     1. Create this content type in Contentful, or')
      console.log('     2. Change contentType in config.js to an existing one')
    }

    console.log('\n✅ Configuration validation complete!')
    console.log('🚀 You can now run the migration with: npm run migrate')

  } catch (error) {
    console.error('\n❌ Validation failed:')
    console.error(`Status: ${error.response?.status}`)
    console.error(`Message: ${error.message}`)
    
    if (error.response?.status === 401) {
      console.error('\n🔑 Authentication Error:')
      console.error('- Check your access token in config.js')
      console.error('- Make sure it\'s a Content Management API token')
      console.error('- Verify the token hasn\'t expired')
    } else if (error.response?.status === 404) {
      console.error('\n🔍 Not Found Error:')
      console.error('- Check your Space ID in config.js')
      console.error('- Verify the environment name')
    }
  }
}

validateConnection();
