# A script to migrate posts from WordPress to Contentful.

This is forked from https://github.com/jonashcroft/wp-to-contentful.

Basic WP to Contentful migration

This only migrates:

 - Post Title
 - Slug
 - Post Content and images in the contents
 - Featured Images 


## How to use the script

This script will run in the terminal via Node. You need to have [npm installed]('https://www.npmjs.com/get-npm').

### Quick Setup

1. **Clone the repository**
   ```bash
   git clone git@github.com/TheCodeCompany/tcc-wp-to-contentful
   cd wp-to-contentful
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up configuration**
   ```bash
   npm run setup
   ```

4. **Edit your configuration in relation to WP & Contentful**

    In your Contentful admin panel:
    1. Go to Settings → API keys
    2. Create or select a Content Management API key
    3. Copy the Space ID and Content Management Token``
    4. Open `config.js` and update with:

      a. WordPress:
        - endpoint - Rest API endpoint of your WP site
        - importPostCount - Number of posts to be processed when running your migrat script

      b. Contentful:
        - AccessToken - Get the API key from your Contentful https://www.contentful.com/developers/docs/concepts/apis/
        - spaceId - YOu can get it from your App's URL https://www.contentful.com/help/spaces/find-space-id/
        - environment - by default master
        - contentType - `blogPost` is default but it varies in the your target Contentful site https://www.contentful.com/help/content-types/
        - contentFormat - richtext is the default
        - importPostCount - batch count to process

5. Customize field mapping (if needed)

```javascript
 let fieldData = {
    id: postData.id,
    type: postData.type,
    postTitle: postData.title.rendered,
    slug: postData.slug,
    content: postData.content.rendered,
    publishDate: postData.date_gmt + '+00:00',
    featuredImage: postData.featured_media,
    tags: getPostLabels(postData.tags, 'tags'),
    categories: getPostLabels(postData.categories, 'categories'),
    contentImages: getPostBodyImages(postData)
 }
 ```

6. **Run the migration**
   ```bash
   npm run migrate
   ```


## Security Notes

- **Never commit sensitive credentials to version control**
- The `config.js` file is automatically excluded from git via `.gitignore`
- Your Contentful access tokens provide full access to your space - keep them secure
- Consider using environment variables in production environments

## Configuration Files

This project uses `config.js` to store sensitive configuration data. The following files are included:

- `config.template.js` - Template with example values (safe to commit)
- `config.js` - Your actual configuration (excluded from git)
- `.env.example` - Alternative environment variable setup (if you prefer .env files)

**IMPORTANT**: There is no sandbox or test environment with this script. If you run this script, it will immediately attempt to publish your new posts and assets - I am not responsible for anything that goes wrong.