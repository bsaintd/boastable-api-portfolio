# The Boastable API

## Description
This API is a SMS feedback gathering tool for small businesses. Businesses register and pay a subscription, through Stripe. This gives them access to a phone number which they can text other numbers to. When they do, a unique link is generated, and a text message is sent to a customer. All interactions created through that link are trackable.

## Module list
* User module
* Stripe integration (tightly couple with stripe, includes a membership mongoose model)
* Auth module
* Feedback module (talks to Twilio and Zapier)
* Communication module
* CRUD template module

## Develop
```
npm install
docker-compose up
```
After running these two commands, the API should be running exposed at port 3000, and the app will be visible at port 8080

## Deploy
You'll need the project's AES key from the team to decrypt the production Dockerfile.
You'll also need access to the Boastable.co Google cloud account.

Once you have those, configure Google cloud CLI to login to the Boastable cloud account

Assuming you meet those conditions, the steps are as follows:

1. Build and push an image of the API
```
jet decrypt Dockerfile.enc Dockerfile
export IMAGE=gcr.io/<gcloud project name>/boastable-api:<tag>
docker build -t $IMAGE .
docker push $IMAGE
```

2. Deploy a new revision on Cloud Run