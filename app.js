function gohome() 
{
    window.location.href = window.location.origin;
    //document.getElementById("home").style.display = "block";
    //document.getElementById("milk-instancer").style.display = "none";
    //document.getElementById("contact-form").style.display = "none";
}
function loadContactForm() 
{
    document.getElementById("home").style.display = "none";
    document.getElementById("contact-form").style.display = "block";
}
function viewProjects() 
{
    document.getElementById("home").style.display = "none";
    document.getElementById("contact-form").style.display = "block";
}
function loadInstancerPage() 
{
    document.getElementById("home").style.display = "none";
    document.getElementById("milk-instancer").style.display = "block";
}
function loadSite()
{
    window.location.href = "\contact/index.html";
}