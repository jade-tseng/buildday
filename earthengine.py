import ee

ee.Authenticate(auth_mode=locals)

ee.Initialize(project='buildday-499318')

# import ee
# SA = 'ee-runner@buildday-499318.iam.gserviceaccount.com'  # your SA email
# credentials = ee.ServiceAccountCredentials(SA, 'key.json')
# ee.Initialize(credentials, project='buildday-499318')