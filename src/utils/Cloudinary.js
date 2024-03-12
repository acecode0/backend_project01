import {v2 as cloudinary} from 'cloudinary';
import exp from 'constants';
import fs from "fs"


cloudinary.config({ 
  cloud_name: process.env.CLOUDINAY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});



const uploadOnCloudinary = async (localFilePath) => {
    try{

        if(!localFilePath) return null

        let startTime = performance.now()

        const response = await cloudinary.uploader.upload(localFilePath,{
            resource_type:"auto"
        })

        // console.log(response)
        // console.log("\n---------------------\n")
        // console.table(response)

        fs.unlinkSync(localFilePath)

        let endTime = performance.now()

        console.log(`Time taken to upload file with size(${response.bytes}): ${endTime - startTime}`)


        return response

    }catch (error){
        fs.unlinkSync(localFilePath)
        return null
    }
}

export {uploadOnCloudinary}