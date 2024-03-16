
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"

import { User } from "../models/user.model.js"

import { uploadOnCloudinary } from "../utils/Cloudinary.js"

import jwt from "jsonwebtoken"

const generateAccessAndRefreshTokens = async (userId) => {
    try {

        // console.log(process.env.ACCESS_TOKEN_EXPIRY)

        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return { accessToken, refreshToken }

    } catch (error) {
        throw new ApiError(500, "Something went wrong! - while generating access and refresh tokens!" + error)
    }
}

const registerUser = asyncHandler(async (req, res) => {

    const { fullname, email, username, password } = req.body

    if (
        [fullname, email, username, password].some(field => field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required!")
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (existedUser) {
        throw new ApiError(409, "User with same username or email already exists!")
    }

    let avatarLocalPath;
    try {
        avatarLocalPath = req.files?.avatar[0]?.path
    } catch (error) {
        throw new ApiError(400, "Avatar Image is required!")
    }

    // const coverImageLocalPath = req.files?.coverImage[0]?.path
    let coverImageLocalPath;

    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar Image is required!")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(500, "Avatar Image uploading failed!")
    }

    const user = await User.create({
        fullName: fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if (!createdUser) {
        throw new ApiError(500, "Something went wrong! While creating User!")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User created successfully!")
    )

})


const loginUser = asyncHandler(async (req, res) => {


    const { userfield, password } = req.body




    if (!userfield) {
        throw new ApiError(400, "Username or Email is required!")
    }
    if (!password) {
        throw new ApiError(400, "Password is required!")
    }

    const user = await User.findOne({
        $or: [{ username: userfield }, { email: userfield }]
    })

    if (!user) {
        throw new ApiError(400, "Invalid Username or Email")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiError(400, "Invalid password!")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const cookieOptions = {
        httpOnly: true,
        secure: true,
    }
    return res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .cookie("refreshToken", refreshToken, cookieOptions)
        .json(
            new ApiResponse(200, {
                user: loggedInUser, accessToken, refreshToken
            },
                "User logged in Successfully!"
            )
        )

})

const logoutUser = asyncHandler(async (req, res) => {

    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: { refreshToken: undefined }
        }, {
        new: true
    }
    )

    const cookieOptions = {
        httpOnly: true,
        secure: true,
    }

    return res
        .status(200)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
        .json(200, {}, "User Logged Out!")

})

const refreshAccessToken = asyncHandler(async (req, res) => {

    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request")
    }

    const decodedToken = jwt.verify(
        incomingRefreshToken,
        process.env.REFRESH_TOKEN_SECRET
    )

    const user = await User.findById(decodedToken?._id)

    if (!user) {
        throw new ApiError(400, "Invalid Token!")
    }
    if (incomingRefreshToken !== user?.refreshToken) {
        throw new ApiError(400, "Invalid Refresh TOken!")
    }

    const cookieOptions = {
        httpOnly: true,
        secure: true,
    }

    const { accessToken, newrefreshToken } = await generateAccessAndRefreshTokens(user?._id)

    return res
        .status(200)
        .cookie("accessToken", accessToken)
        .cookie("refreshToken", newrefreshToken)
        .json(
            new ApiResponse(
                200,
                { accessToken, refreshToken: newrefreshToken },
                "Access token refreshed!"
            )
        )

})


const changeCurrentPassword = asyncHandler(async (req, res) => {

    const { oldPassword, newPassword } = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordValid = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordValid) {
        throw new ApiError(400, "Invalid Old password")
    }

    user.password = newPassword
    await user.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "Password Changed Successfully!"
            )
        )

})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "Current User fetched successfully!"))
})


const updateAccountDetails = asyncHandler(async (req, res) => {

    const { fullname, email, username } = req.body

    if (!fullname?.trim() || !email?.trim() || !username?.trim()) {
        throw new ApiError(400, "All fields are required!")
    }

    // console.log(req.user._id)


    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName: fullname,
                email,
                username,
            }
        },
        { new: true }
    ).select("-password -refreshToken")

    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "User Details Updated successfully!")
        )



})

const updateUserAvatar = asyncHandler(async (req, res) => {

    const avatarLocalPath = req.file?.path

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is Missing!")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if (!avatar.url) {
        throw new ApiError(500, "Something went wrong while uploading on Cloudinary!")
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: { avatar: avatar.url }
        },
        { new: true }
    ).select("-password -refreshToken")


    return res.status(200).json(new ApiResponse(200, user, "Avatar Uploaded Successfully!"))

})

const updateUserCoverImage = asyncHandler(async (req, res) => {

    const CoverImageLocalPath = req.file?.path

    if (!CoverImageLocalPath) {
        throw new ApiError(400, "CoverImage file is Missing!")
    }

    const CoverImage = await uploadOnCloudinary(CoverImageLocalPath)

    if (!CoverImage.url) {
        throw new ApiError(500, "Something went wrong while uploading on Cloudinary!")
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: { CoverImage: CoverImage.url }
        },
        { new: true }
    ).select("-password -refreshToken")


    return res.status(200).json(new ApiResponse(200, user, "CoverImage Uploaded Successfully!"))

})

const getUserChannelProfile = asyncHandler(async (req, res) => {

    const { username } = req.params

    if (!username?.trim()) {
        throw new ApiError(400, "Username is Missing!")
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        }, {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        }, {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        }, {
            $addFields: {
                subscribersCount: {
                    $size: "subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false
                    }
                }
            }

        },{
            $project:{
                fullName:1,
                username:1,
                subscribersCount:1,
                channelsSubscribedToCount:1,
                isSubscribed:1,
                avatar:1,
                coverImage:1,
                email:1,
            }
        }
    ])

    if(!channel?.length){
        throw new ApiError(404,"Channel does not exists")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(200,channel[0],"User Channel fetched Successfully!")
    )

})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage
}