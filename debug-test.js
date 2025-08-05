console.log('1. Script starting...')

try {
  console.log('2. Loading dependencies...')
  const contentful = require('contentful-management')
  const axios = require('axios')
  const fs = require('fs')
  const TurndownService = require('turndown')
  console.log('3. Dependencies loaded successfully')

  console.log('4. Loading configuration...')
  const config = require('./config')
  console.log('5. Configuration loaded:', {
    wpEndpoint: config.wordpress.endpoint,
    importCount: config.wordpress.importPostCount,
    spaceId: config.contentful.spaceId,
    contentType: config.contentful.contentType
  })

  console.log('6. Creating Contentful client...')
  const client = contentful.createClient({
    accessToken: config.contentful.accessToken
  })
  console.log('7. Contentful client created successfully')

  console.log('8. Testing simple HTTP request...')
  axios.get(config.wordpress.endpoint + 'posts?per_page=1')
    .then(response => {
      console.log('9. WordPress API test successful, posts available:', response.data.length)
      console.log('✅ All basic tests passed!')
    })
    .catch(error => {
      console.error('❌ WordPress API test failed:', error.message)
    })

} catch (error) {
  console.error('❌ Error in test script:', error)
  console.error('Stack:', error.stack)
}
