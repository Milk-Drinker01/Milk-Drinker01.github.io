function gohome() 
{
    window.location.href = window.location.origin;
}
function loadContactForm() 
{
    window.location.href = "/contact/index.html";
}
function viewProjects() 
{
    window.location.href = "/projects/index.html";
}
function loadInstancerPage() 
{
    document.getElementById("home").style.display = "none";
    document.getElementById("milk-instancer").style.display = "block";
}