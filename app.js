function loadInstancerPage() 
{
    document.getElementById("home").style.display = "none";
    document.getElementById("milk-instancer").style.display = "block";
}
function loadContactForm() 
{
    document.getElementById("home").style.display = "none";
    document.getElementById("contact-form").style.display = "block";
}
function gohome() 
{
    document.getElementById("home").style.display = "block";
    document.getElementById("milk-instancer").style.display = "none";
    document.getElementById("contact-form").style.display = "none";
}