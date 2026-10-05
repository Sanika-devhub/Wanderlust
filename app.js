if (process.env.NODE_ENV != "production") {
    require('dotenv').config()
}

const dns = require("dns");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const dburl=process.env.ATLASDB_URL;
const express = require("express");
const app = express();
const path = require("path");
const Listing = require("./models/listing.js");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const warpAsync = require("./utils/wrapAsync.js");
const ExpressError = require("./utils/ExpressError.js");
// const { listingSchema, reviewSchema } = require("./schema.js");
const Review = require("./models/review.js");
const session = require("express-session");
const {MongoStore}=require("connect-mongo");
const flash = require("connect-flash");
const passport = require("passport");
const localStrategy = require("passport-local");
const User = require("./models/user.js");
const { isLoggedIn, isOwner, validateListing, validatereview } = require("./middleware.js");
const { saveRedirectUrl, isReviewAuthor } = require("./middleware.js");
const multer = require('multer');
const { storage } = require("./cloudConfig.js");
const upload = multer({ storage });
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const maptoken = process.env.MAP_TOKENS;
const geocodingClient = mbxGeocoding({ accessToken: maptoken });


app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "/views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(methodOverride("_method"));
app.engine('ejs', ejsMate);

//mongo store
const store=MongoStore.create({  
    mongoUrl:dburl,
    crypto:{
        secret: process.env.SECRET,
    },
    touchAfter: 24 * 3600,


});

store.on("error",()=>{
    console.log("error in mongo db session!",err);
});

const sessionOption = {
    store,
    secret:  process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,

    }
}

app.use(session(sessionOption));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new localStrategy(User.authenticate()));

// use static serialize and deserialize of model for passport session support
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
    res.locals.success = req.flash(("success"));
    res.locals.error = req.flash(("error"));
    res.locals.currUser = req.user;
    next();
})


const mongoose = require('mongoose');
const { wrap } = require("module");
const wrapAsync = require("./utils/wrapAsync.js");
console.log(dburl);
main()
    .then(() => {
        console.log("connection successful");
    })
    .catch((err) => {
        console.log("MongoDB connection error:", err);
    });

async function main() {
    await mongoose.connect(dburl);
}



//signup route
app.get("/signup", (req, res) => {
    res.render("users/signup.ejs")
});
app.post("/signup", async (req, res) => {
    try {
        let { username, email, password } = req.body;
        const newuser = new User({ username, email });
        let registeruser = await User.register(newuser, password);
        req.login(registeruser, (err) => {
            if (err) {
                return next(err);
            }
            req.flash("success", "Welcome to Wanderlust");
            // console.log(registeruser);
            res.redirect("/listings");

        });

    }
    catch (e) {
        req.flash("error", e.message);
        res.redirect("/signup");
    }
});

//login route
app.get("/login", (req, res) => {
    res.render("users/login.ejs");
});
app.post("/login",
    saveRedirectUrl,
    passport.authenticate("local", { failureRedirect: '/login', failureFlash: true }),
    async (req, res) => {
        req.flash("success", "welcome Back to wanderlust!");
        let redirectUrl = res.locals.redirectUrl;
        res.redirect(redirectUrl || "/listings");

    });

//loggedout route
app.get("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        req.flash("success", "you logged out successfully!");
        res.redirect("/listings");
    });
});


//index route
app.get("/listings", warpAsync(async (req, res) => {

    let allListing = await Listing.find({});
    //  console.log(allListing);
    res.render("listing.ejs", { allListing });

}));

//create new route
app.get("/listings/new", isLoggedIn, (req, res) => {
    res.render("new.ejs");
});

//show route
app.get("/listings/:id", warpAsync(async (req, res) => {
    let { id } = req.params;
    let listing = await Listing.findById(id)
        .populate({
            path: "reviews",
            populate: {
                path: "author",
            }
        })
        .populate("owner");
    // if(!listing){
    //      req.flash("error", "Listing you want was no longer exist!");
    //      res.redirect("/listings");
    // }
    res.render("show.ejs", { listing });

}));

//additing new listing
app.post("/listings", isLoggedIn, upload.single('listing[image]'), validateListing, warpAsync(async (req, res) => {

   let response= await geocodingClient.forwardGeocode({
        query: req.body.listing.location,
        limit: 1
    })
     .send()

    let url = req.file.path;
    let filename = req.file.filename;
    let newlisting = new Listing(req.body.listing);
    newlisting.owner = req.user._id;
    newlisting.image = { url, filename };
    newlisting.geometry=response.body.features[0].geometry;
    savedlisting=await newlisting.save();
    console.log(savedlisting);

    req.flash("success", "new Listing generated!");

    res.redirect("/listings");
}));


//route for editing listing
app.get("/listings/:id/edit", isLoggedIn, isOwner, warpAsync(async (req, res) => {
    let { id } = req.params;
    let listing = await Listing.findById(id);
    res.render("edit.ejs", { listing });
}));

//update route
app.put("/listings/:id", isLoggedIn, isOwner, upload.single('listing[image]'), validateListing, warpAsync(async (req, res) => {
    if (!req.body.listing) {
        throw new ExpressError(400, "send valid data for listing!");
    };
    let { id } = req.params;
    let listing = await Listing.findByIdAndUpdate(id, { ...req.body.listing });
    if (typeof req.file !== "undefined") {
        let url = req.file.path;
        let filename = req.file.filename;
        listing.image = { url, filename };
        await listing.save();
    };
    req.flash("success", " Listing Edited!");
    res.redirect(`/listings/${id}`);

}));

//delete route
app.delete("/listings/:id", isLoggedIn, isOwner, warpAsync(async (req, res) => {
    let { id } = req.params;
    let listing = await Listing.findById(id);
    await Listing.findByIdAndDelete(id);
    console.log(listing);
    req.flash("success", "Listing deleted!");
    res.redirect("/listings");

}));
//posting new review
app.post("/listings/:id/reviews", isLoggedIn, validatereview, warpAsync(async (req, res) => {
    let listing = await Listing.findById(req.params.id);
    let newReview = new Review(req.body.review);
    newReview.author = req.user._id;
    listing.reviews.push(newReview);
    await newReview.save();
    await listing.save();
    req.flash("success", "new review generated!");
    res.redirect(`/listings/${listing._id}`);


}));

//delete review
app.delete("/listings/:id/reviews/:reviewID", isLoggedIn, isReviewAuthor, wrapAsync(async (req, res) => {
    console.log("DELETE ROUTE");
    console.log(req.params);
    let { id, reviewID } = req.params;
    let updatedListing = await Listing.findByIdAndUpdate(
        id,
        { $pull: { reviews: reviewID } },
        { new: true }
    );
    console.log("AFTER:");
    console.log(updatedListing.reviews);
    let deleted = await Review.findByIdAndDelete(reviewID);
    console.log("DELETED:", deleted);
    req.flash("success", "review deleted!");
    res.redirect(`/listings/${id}`);


}));

app.all("/*splat", (req, res, next) => {

    next(new ExpressError(404, "paage not found!"));
});


app.use((err, req, res, next) => {

    let { statuscode = 500, message } = err;
    // console.log(err.stack);

    res.render("error.ejs", { message })

    // res.status(statuscode).send(err.message);

});




app.listen("3000", (req, res) => {
    console.log("app is listening");
})