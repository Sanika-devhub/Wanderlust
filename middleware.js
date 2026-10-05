const Listing = require("./models/listing.js");
const { listingSchema, reviewSchema } = require("./schema.js");
const ExpressError = require("./utils/ExpressError.js");
const warpAsync = require("./utils/wrapAsync.js");
const Review = require("./models/review.js");

module.exports.isLoggedIn = (req, res, next) => {
    if (!req.isAuthenticated()) {
        req.session.redirectUrl=req.originalUrl;
        req.flash("error", "you must be logged in to create new listing!");
        return res.redirect("/login");
    }
    next();
}
module.exports.saveRedirectUrl=(req,res,next)=>{
    if(req.session.redirectUrl){
     res.locals.redirectUrl = req.session.redirectUrl;
    }
    next();
    

};

module.exports.isOwner=async(req,res,next)=>{
     let { id } = req.params;
    let listing=await Listing.findById(id);
    if (!listing) {
    throw new ExpressError(404, "Listing not found!");
    }

   if (!listing.owner.equals(res.locals.currUser._id)) {
        req.flash("error", "Sorry! You don't have permission to update this listing.");
        return res.redirect(`/listings/${id}`);
    }
    next();

};
//schemavaliadation
module.exports. validateListing = (req, res, next) => {
    let { error } = listingSchema.validate(req.body);
    //  console.log("REQ.BODY =", req.body);
    if (error) {
        let errMsg = error.details.map((el) => el.message).join(",");
        throw new ExpressError(400, errMsg);
    } else {
        next();
    }
};

//review validation
module.exports.validatereview = (req, res, next) => {
    let { error } = reviewSchema.validate(req.body);
    if (error) {
        let errMsg = error.details.map((el) => el.message).join(" ");
        throw new ExpressError(400, errMsg);
    }
    else {
        next();
    }
};

module.exports.isReviewAuthor=async(req,res,next)=>{
     let { id,reviewID } = req.params;
    let review=await Review.findById(reviewID);
   if (!review.author.equals(res.locals.currUser._id)) {
        req.flash("error", "Sorry! You don't have permission to update this review.");
        return res.redirect(`/listings/${id}`);
    }
    next();

};